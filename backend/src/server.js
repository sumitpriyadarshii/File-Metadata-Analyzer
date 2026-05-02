import chokidar from "chokidar";
import crypto from "crypto";
import cors from "cors";
import express from "express";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { openDb } from "./db.js";
import { scanDirectory, refreshScanSummary } from "./scan.js";
import { classifyExt } from "./fileTypes.js";
import { getOwnerAndAttributes } from "./owner.js";
import { hashFile } from "./hash.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const frontendDir = path.join(rootDir, "frontend");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "landing.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(frontendDir, "dashboard.html"));
});

app.use(express.static(frontendDir));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on("connection", (socket) => {
  wsClients.add(socket);

  socket.on("close", () => {
    wsClients.delete(socket);
  });
});

const db = await openDb();

const IGNORED_DIRS = new Set([
  "$RECYCLE.BIN",
  "System Volume Information",
  "node_modules",
  ".git"
]);

const jobs = new Map();
const jobQueue = [];
let activeJob = null;

let activeWatcher = null;
let summaryTimer = null;

function broadcast(payload) {
  const message = JSON.stringify(payload);
  wsClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function toIso(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function modeToPermissions(mode) {
  const flags = [
    mode & 0o400 ? "r" : "-",
    mode & 0o200 ? "w" : "-",
    mode & 0o100 ? "x" : "-",
    mode & 0o040 ? "r" : "-",
    mode & 0o020 ? "w" : "-",
    mode & 0o010 ? "x" : "-",
    mode & 0o004 ? "r" : "-",
    mode & 0o002 ? "w" : "-",
    mode & 0o001 ? "x" : "-"
  ];

  return flags.join("");
}

function isIgnoredPath(targetPath) {
  return targetPath.split(path.sep).some((segment) => IGNORED_DIRS.has(segment));
}

function isPathAllowed(targetPath) {
  const allowedRoot = process.env.SCAN_ROOT;
  if (!allowedRoot) {
    return true;
  }

  const resolvedRoot = path.resolve(allowedRoot);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedRoot);
}

async function getLatestScanRow() {
  const row = await db.get("SELECT id, root_path as rootPath FROM scans ORDER BY id DESC LIMIT 1");
  return row || null;
}

async function getScanIdFromRequest(req) {
  const scanId = req.query.scanId ? Number(req.query.scanId) : null;
  if (scanId) {
    return scanId;
  }

  const latest = await getLatestScanRow();
  return latest ? latest.id : null;
}

function createJob(pathValue, options) {
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    path: pathValue,
    incremental: Boolean(options.incremental),
    result: null,
    error: null,
    progress: {
      processed: 0,
      path: null
    }
  };

  jobs.set(jobId, job);
  jobQueue.push(jobId);
  broadcast({ type: "scan-queued", jobId, path: pathValue });
  processNextJob();
  return job;
}

async function processNextJob() {
  if (activeJob || jobQueue.length === 0) {
    return;
  }

  const jobId = jobQueue.shift();
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  activeJob = jobId;
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.progress = { processed: 0, path: null };
  broadcast({ type: "scan-started", jobId, path: job.path, startedAt: job.startedAt });

  stopWatcher();

  try {
    const result = await scanDirectory(db, job.path, {
      incremental: job.incremental,
      onProgress: (payload) => {
        job.progress = {
          processed: payload.processed,
          path: payload.path || null
        };
        broadcast({
          type: "scan-progress",
          jobId,
          processed: payload.processed,
          path: payload.path || null
        });
      }
    });
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    broadcast({ type: "scan-completed", jobId, result });
    await startWatcher(result.rootPath, result.scanId);
  } catch (error) {
    job.status = "failed";
    job.error = error?.message || "scan failed";
    broadcast({ type: "scan-failed", jobId, error: job.error });
  } finally {
    activeJob = null;
    processNextJob();
  }
}

function trimJobs(limit = 50) {
  const jobList = Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  jobList.slice(limit).forEach((job) => jobs.delete(job.id));
}

function scheduleSummaryRefresh(scanId) {
  if (summaryTimer) {
    clearTimeout(summaryTimer);
  }

  summaryTimer = setTimeout(async () => {
    try {
      await refreshScanSummary(db, scanId);
    } catch (error) {
      // ignore
    }
  }, 800);
}

async function upsertWatchedPath(scanId, filePath, isDirOverride = null) {
  if (isIgnoredPath(filePath)) {
    return;
  }

  let stat;
  try {
    stat = await fs.promises.lstat(filePath);
  } catch (error) {
    return;
  }

  const isSymlink = stat.isSymbolicLink();
  const isDir = isDirOverride !== null ? isDirOverride : stat.isDirectory();
  const createdAt = toIso(stat.birthtimeMs ? stat.birthtime : stat.ctime);
  const modifiedAt = toIso(stat.mtime);
  const accessedAt = toIso(stat.atime);
  const permissions = modeToPermissions(stat.mode);
  const inode = stat.ino ? String(stat.ino) : null;
  const hardLinks = stat.nlink || 0;

  let owner = null;
  let isHidden = path.basename(filePath).startsWith(".");
  let isSystem = false;

  if (!isDir) {
    const ownerInfo = await getOwnerAndAttributes(filePath);
    owner = ownerInfo.owner;
    if (process.platform === "win32") {
      isHidden = ownerInfo.isHidden;
      isSystem = ownerInfo.isSystem;
    }
  }

  const ext = isDir ? null : path.extname(filePath).toLowerCase();
  const type = isDir ? "Folder" : (isSymlink ? "Symlink" : classifyExt(ext));
  const hash = !isDir && !isSymlink ? await hashFile(filePath, stat.size) : null;

  await db.run(
    `
      INSERT INTO files (
        scan_id,
        path,
        name,
        ext,
        type,
        size_bytes,
        created_at,
        modified_at,
        accessed_at,
        owner,
        permissions,
        inode,
        hard_links,
        hash,
        is_symlink,
        is_hidden,
        is_system,
        is_dir
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scan_id, path) DO UPDATE SET
        name = excluded.name,
        ext = excluded.ext,
        type = excluded.type,
        size_bytes = excluded.size_bytes,
        created_at = excluded.created_at,
        modified_at = excluded.modified_at,
        accessed_at = excluded.accessed_at,
        owner = excluded.owner,
        permissions = excluded.permissions,
        inode = excluded.inode,
        hard_links = excluded.hard_links,
        hash = excluded.hash,
        is_symlink = excluded.is_symlink,
        is_hidden = excluded.is_hidden,
        is_system = excluded.is_system,
        is_dir = excluded.is_dir
    `,
    [
      scanId,
      filePath,
      path.basename(filePath),
      ext,
      type,
      isDir ? 0 : stat.size,
      createdAt,
      modifiedAt,
      accessedAt,
      owner,
      permissions,
      inode,
      hardLinks,
      hash,
      isSymlink ? 1 : 0,
      isHidden ? 1 : 0,
      isSystem ? 1 : 0,
      isDir ? 1 : 0
    ]
  );

  scheduleSummaryRefresh(scanId);
}

async function removeWatchedPath(scanId, filePath) {
  await db.run("DELETE FROM files WHERE scan_id = ? AND path = ?", [scanId, filePath]);
  scheduleSummaryRefresh(scanId);
}

async function startWatcher(rootPath, scanId) {
  if (!rootPath || !scanId) {
    return;
  }

  if (activeWatcher && activeWatcher.rootPath === rootPath && activeWatcher.scanId === scanId) {
    return;
  }

  await stopWatcher();

  const watcher = chokidar.watch(rootPath, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    },
    ignored: (target) => isIgnoredPath(target)
  });

  watcher.on("add", (target) => upsertWatchedPath(scanId, target, false));
  watcher.on("change", (target) => upsertWatchedPath(scanId, target, false));
  watcher.on("addDir", (target) => upsertWatchedPath(scanId, target, true));
  watcher.on("unlink", (target) => removeWatchedPath(scanId, target));
  watcher.on("unlinkDir", (target) => removeWatchedPath(scanId, target));

  activeWatcher = { watcher, rootPath, scanId };
}

async function stopWatcher() {
  if (!activeWatcher) {
    return;
  }

  await activeWatcher.watcher.close();
  activeWatcher = null;
}

function escapeCsv(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, "\"")}"`;
}

app.get("/api/summary", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({
      totalFiles: 0,
      totalFolders: 0,
      totalSizeBytes: 0,
      oldestFilePath: null,
      oldestFileDate: null
    });
    return;
  }

  const scan = await db.get(
    `
      SELECT
        total_files as totalFiles,
        total_folders as totalFolders,
        total_size_bytes as totalSizeBytes,
        oldest_file_path as oldestFilePath,
        oldest_file_created_at as oldestFileDate
      FROM scans
      WHERE id = ?
    `,
    [scanId]
  );

  res.json(scan);
});

app.get("/api/files", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit || "10", 10), 200);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

  const rows = await db.all(
    `
      SELECT
        id,
        name,
        ext,
        type,
        size_bytes as sizeBytes,
        created_at as createdAt,
        modified_at as modifiedAt,
        accessed_at as accessedAt,
        owner,
        permissions,
        inode,
        hard_links as hardLinks,
        hash,
        is_symlink as isSymlink,
        is_hidden as isHidden,
        is_system as isSystem,
        path
      FROM files
      WHERE scan_id = ? AND is_dir = 0
      ORDER BY modified_at DESC
      LIMIT ? OFFSET ?
    `,
    [scanId, limit, offset]
  );

  res.json({ items: rows });
});

app.get("/api/files/all", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit || "5000", 10), 10000);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

  const rows = await db.all(
    `
      SELECT
        id,
        name,
        ext,
        type,
        size_bytes as sizeBytes,
        created_at as createdAt,
        modified_at as modifiedAt,
        accessed_at as accessedAt,
        owner,
        permissions,
        inode,
        hard_links as hardLinks,
        hash,
        is_symlink as isSymlink,
        is_hidden as isHidden,
        is_system as isSystem,
        path
      FROM files
      WHERE scan_id = ? AND is_dir = 0
      ORDER BY modified_at DESC
      LIMIT ? OFFSET ?
    `,
    [scanId, limit, offset]
  );

  res.json({ items: rows });
});

app.get("/api/search", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [], nextCursor: null });
    return;
  }

  const conditions = ["scan_id = ?", "is_dir = 0"];
  const params = [scanId];

  if (req.query.name) {
    conditions.push("name LIKE ?");
    params.push(`%${req.query.name}%`);
  }

  if (req.query.owner) {
    conditions.push("owner LIKE ?");
    params.push(`%${req.query.owner}%`);
  }

  if (req.query.type) {
    conditions.push("type = ?");
    params.push(String(req.query.type));
  }

  if (req.query.minSize) {
    conditions.push("size_bytes >= ?");
    params.push(Number(req.query.minSize));
  }

  if (req.query.maxSize) {
    conditions.push("size_bytes <= ?");
    params.push(Number(req.query.maxSize));
  }

  if (req.query.fromDate) {
    conditions.push("modified_at >= ?");
    params.push(String(req.query.fromDate));
  }

  if (req.query.toDate) {
    conditions.push("modified_at <= ?");
    params.push(String(req.query.toDate));
  }

  const sortMap = {
    name: "name",
    size: "size_bytes",
    created: "created_at",
    modified: "modified_at"
  };

  const sortBy = sortMap[String(req.query.sortBy || "modified")] || "modified_at";
  const sortDir = String(req.query.sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;

  if (cursor) {
    const comparator = sortDir === "ASC" ? ">" : "<";
    conditions.push(`id ${comparator} ?`);
    params.push(cursor);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db.all(
    `
      SELECT
        id,
        name,
        ext,
        type,
        size_bytes as sizeBytes,
        created_at as createdAt,
        modified_at as modifiedAt,
        accessed_at as accessedAt,
        owner,
        permissions,
        inode,
        hard_links as hardLinks,
        hash,
        is_symlink as isSymlink,
        is_hidden as isHidden,
        is_system as isSystem,
        path
      FROM files
      ${whereClause}
      ORDER BY ${sortBy} ${sortDir}
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  const nextCursor = rows.length ? rows[rows.length - 1].id : null;
  res.json({ items: rows, nextCursor });
});

app.get("/api/duplicates", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const groups = await db.all(
    `
      SELECT hash, COUNT(*) as count
      FROM files
      WHERE scan_id = ? AND is_dir = 0 AND hash IS NOT NULL
      GROUP BY hash
      HAVING count > 1
      ORDER BY count DESC
      LIMIT 50
    `,
    [scanId]
  );

  const items = [];
  for (const group of groups) {
    const files = await db.all(
      `
        SELECT name, path, size_bytes as sizeBytes, modified_at as modifiedAt
        FROM files
        WHERE scan_id = ? AND hash = ?
      `,
      [scanId, group.hash]
    );

    items.push({
      hash: group.hash,
      count: group.count,
      files
    });
  }

  res.json({ items });
});

app.get("/api/aging", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const days = Math.max(parseInt(req.query.days || "90", 10), 1);
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db.all(
    `
      SELECT name, path, size_bytes as sizeBytes, modified_at as modifiedAt
      FROM files
      WHERE scan_id = ? AND is_dir = 0 AND modified_at <= ?
      ORDER BY modified_at ASC
      LIMIT ?
    `,
    [scanId, cutoff, limit]
  );

  res.json({ items: rows, cutoff });
});

app.get("/api/dir-summary", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const scanRow = await db.get("SELECT root_path as rootPath FROM scans WHERE id = ?", [scanId]);
  if (!scanRow) {
    res.json({ items: [] });
    return;
  }

  const depth = Math.max(parseInt(req.query.depth || "2", 10), 1);
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 200);

  const rows = await db.all(
    "SELECT path, size_bytes as sizeBytes FROM files WHERE scan_id = ? AND is_dir = 0",
    [scanId]
  );

  const summary = new Map();

  rows.forEach((row) => {
    const relative = path.relative(scanRow.rootPath, row.path);
    const parts = relative.split(path.sep).filter(Boolean);
    const groupParts = parts.slice(0, depth);
    const groupKey = groupParts.length ? path.join(scanRow.rootPath, ...groupParts) : scanRow.rootPath;

    if (!summary.has(groupKey)) {
      summary.set(groupKey, { path: groupKey, totalFiles: 0, totalSizeBytes: 0 });
    }

    const item = summary.get(groupKey);
    item.totalFiles += 1;
    item.totalSizeBytes += row.sizeBytes || 0;
  });

  const items = Array.from(summary.values())
    .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes)
    .slice(0, limit);

  res.json({ items });
});

app.get("/api/file-types", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const rows = await db.all(
    `
      SELECT type, COUNT(*) as count
      FROM files
      WHERE scan_id = ? AND is_dir = 0
      GROUP BY type
      ORDER BY count DESC
    `,
    [scanId]
  );

  res.json({ items: rows });
});

app.get("/api/largest", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const rows = await db.all(
    `
      SELECT
        name,
        size_bytes as sizeBytes,
        path
      FROM files
      WHERE scan_id = ? AND is_dir = 0
      ORDER BY size_bytes DESC
      LIMIT 5
    `,
    [scanId]
  );

  res.json({ items: rows });
});

app.get("/api/size-buckets", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.json({ items: [] });
    return;
  }

  const row = await db.get(
    `
      SELECT
        SUM(CASE WHEN size_bytes < 10240 THEN 1 ELSE 0 END) as b0,
        SUM(CASE WHEN size_bytes >= 10240 AND size_bytes < 1048576 THEN 1 ELSE 0 END) as b1,
        SUM(CASE WHEN size_bytes >= 1048576 AND size_bytes < 10485760 THEN 1 ELSE 0 END) as b2,
        SUM(CASE WHEN size_bytes >= 10485760 AND size_bytes < 104857600 THEN 1 ELSE 0 END) as b3,
        SUM(CASE WHEN size_bytes >= 104857600 THEN 1 ELSE 0 END) as b4
      FROM files
      WHERE scan_id = ? AND is_dir = 0
    `,
    [scanId]
  );

  const items = [
    { label: "0 - 10 KB", count: row?.b0 || 0 },
    { label: "10 KB - 1 MB", count: row?.b1 || 0 },
    { label: "1 MB - 10 MB", count: row?.b2 || 0 },
    { label: "10 MB - 100 MB", count: row?.b3 || 0 },
    { label: "100+ MB", count: row?.b4 || 0 }
  ];

  res.json({ items });
});

app.get("/api/recent-scans", async (req, res) => {
  const rows = await db.all(
    `
      SELECT
        id,
        root_path as rootPath,
        started_at as startedAt,
        completed_at as completedAt,
        total_files as totalFiles,
        total_folders as totalFolders,
        total_size_bytes as totalSizeBytes
      FROM scans
      ORDER BY id DESC
      LIMIT 5
    `
  );

  res.json({ items: rows });
});

app.get("/api/export", async (req, res) => {
  const scanId = await getScanIdFromRequest(req);
  if (!scanId) {
    res.status(404).json({ error: "no scan" });
    return;
  }

  const format = String(req.query.format || "csv").toLowerCase();
  const rows = await db.all(
    `
      SELECT
        name,
        type,
        size_bytes as sizeBytes,
        created_at as createdAt,
        modified_at as modifiedAt,
        owner,
        path
      FROM files
      WHERE scan_id = ? AND is_dir = 0
      ORDER BY modified_at DESC
    `,
    [scanId]
  );

  if (format === "json") {
    res.json({ items: rows });
    return;
  }

  const header = ["Name", "Type", "SizeBytes", "CreatedAt", "ModifiedAt", "Owner", "Path"];
  const lines = [header.join(",")];

  rows.forEach((file) => {
    const values = [
      file.name,
      file.type,
      file.sizeBytes,
      file.createdAt,
      file.modifiedAt,
      file.owner,
      file.path
    ].map(escapeCsv);

    lines.push(values.join(","));
  });

  const fileName = `file-metadata-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
  res.send(lines.join("\n"));
});

app.post("/api/scan", async (req, res) => {
  const inputPath = typeof req.body?.path === "string" ? req.body.path.trim() : "";
  if (!inputPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  const absolutePath = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);

  if (!fs.existsSync(absolutePath)) {
    res.status(400).json({ error: "path does not exist" });
    return;
  }

  if (!isPathAllowed(absolutePath)) {
    res.status(403).json({ error: "path not allowed" });
    return;
  }

  const incremental = Boolean(req.body?.incremental);
  const syncMode = Boolean(req.query.sync === "true" || req.body?.sync === true);

  if (syncMode) {
    try {
      const result = await scanDirectory(db, absolutePath, { incremental });
      await startWatcher(result.rootPath, result.scanId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "scan failed" });
    }
    return;
  }

  const job = createJob(absolutePath, { incremental });
  trimJobs();
  res.json({ jobId: job.id, status: job.status });
});

app.get("/api/status/:jobId", async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }

  res.json(job);
});

app.get("/api/watch", async (req, res) => {
  if (!activeWatcher) {
    res.json({ active: false });
    return;
  }

  res.json({
    active: true,
    rootPath: activeWatcher.rootPath,
    scanId: activeWatcher.scanId
  });
});

app.delete("/api/watch", async (req, res) => {
  await stopWatcher();
  res.json({ ok: true });
});

app.delete("/api/reset", async (req, res) => {
  try {
    await db.exec("DELETE FROM files;");
    await db.exec("DELETE FROM scans;");
    await db.exec("VACUUM;");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "reset failed" });
  }
});

app.get("/api/system-info", async (req, res) => {
  try {
    const cpus = os.cpus();
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    
    // Convert bytes to GB for readability
    const totalMemGB = (totalMemBytes / (1024 ** 3)).toFixed(2);
    const freeMemGB = (freeMemBytes / (1024 ** 3)).toFixed(2);
    const usedMemGB = ((totalMemBytes - freeMemBytes) / (1024 ** 3)).toFixed(2);
    
    const info = {
      os: os.platform(),
      arch: os.arch(),
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model || "Unknown",
      totalMemory: totalMemGB,
      freeMemory: freeMemGB,
      usedMemory: usedMemGB,
      uptime: Math.floor(os.uptime()),
      hostname: os.hostname(),
      username: os.userInfo()?.username || "Unknown",
      homeDir: os.homedir(),
      tempDir: os.tmpdir(),
      release: os.release(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    };
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: "Failed to get system info", details: error.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
