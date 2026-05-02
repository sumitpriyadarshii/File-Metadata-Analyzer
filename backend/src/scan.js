import fs from "fs";
import path from "path";
import { classifyExt } from "./fileTypes.js";
import { getOwnerAndAttributes } from "./owner.js";
import { hashFile } from "./hash.js";

const IGNORED_DIRS = new Set([
  "$RECYCLE.BIN",
  "System Volume Information",
  "node_modules",
  ".git"
]);

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

async function updateScanSummary(db, scanId) {
  const totals = await db.get(
    `
      SELECT
        SUM(CASE WHEN is_dir = 0 THEN 1 ELSE 0 END) as totalFiles,
        SUM(CASE WHEN is_dir = 1 THEN 1 ELSE 0 END) as totalFolders,
        SUM(CASE WHEN is_dir = 0 THEN size_bytes ELSE 0 END) as totalSize
      FROM files
      WHERE scan_id = ?
    `,
    [scanId]
  );

  const oldest = await db.get(
    `
      SELECT path, created_at as createdAt
      FROM files
      WHERE scan_id = ? AND is_dir = 0 AND created_at IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [scanId]
  );

  await db.run(
    `
      UPDATE scans
      SET completed_at = ?,
          total_files = ?,
          total_folders = ?,
          total_size_bytes = ?,
          oldest_file_path = ?,
          oldest_file_created_at = ?
      WHERE id = ?
    `,
    [
      new Date().toISOString(),
      totals?.totalFiles || 0,
      totals?.totalFolders || 0,
      totals?.totalSize || 0,
      oldest?.path || null,
      oldest?.createdAt || null,
      scanId
    ]
  );
}

async function getExistingMap(db, scanId) {
  const rows = await db.all(
    "SELECT path, modified_at as modifiedAt, size_bytes as sizeBytes, is_dir as isDir, is_symlink as isSymlink FROM files WHERE scan_id = ?",
    [scanId]
  );

  const map = new Map();
  rows.forEach((row) => map.set(row.path, row));
  return map;
}

export async function scanDirectory(db, rootPath, options = {}) {
  const incremental = Boolean(options.incremental);
  const includeSymlinks = options.includeSymlinks !== false;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const startedAt = new Date().toISOString();

  let scanId = options.scanId || null;
  if (incremental && !scanId) {
    const row = await db.get(
      "SELECT id FROM scans WHERE root_path = ? ORDER BY id DESC LIMIT 1",
      [rootPath]
    );
    scanId = row ? row.id : null;
  }

  if (!scanId) {
    const scanInsert = await db.run(
      "INSERT INTO scans (root_path, started_at) VALUES (?, ?)",
      [rootPath, startedAt]
    );
    scanId = scanInsert.lastID;
  }

  const existingMap = incremental ? await getExistingMap(db, scanId) : new Map();
  const seenPaths = new Set();
  let processedCount = 0;

  function reportProgress(currentPath) {
    if (!onProgress) {
      return;
    }

    processedCount += 1;
    if (processedCount % 50 === 0) {
      onProgress({ processed: processedCount, path: currentPath });
    }
  }

  const insertStmt = await db.prepare(`
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
  `);

  async function upsertRecord(record) {
    await insertStmt.run(
      scanId,
      record.path,
      record.name,
      record.ext,
      record.type,
      record.sizeBytes,
      record.createdAt,
      record.modifiedAt,
      record.accessedAt,
      record.owner,
      record.permissions,
      record.inode,
      record.hardLinks,
      record.hash,
      record.isSymlink,
      record.isHidden,
      record.isSystem,
      record.isDir
    );
  }

  async function walk(currentPath) {
    let entries;
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      let stat;

      try {
        stat = await fs.promises.lstat(fullPath);
      } catch (error) {
        continue;
      }

      const isSymlink = stat.isSymbolicLink();
      if (isSymlink && !includeSymlinks) {
        continue;
      }

      const createdAt = toIso(stat.birthtimeMs ? stat.birthtime : stat.ctime);
      const modifiedAt = toIso(stat.mtime);
      const accessedAt = toIso(stat.atime);
      const permissions = modeToPermissions(stat.mode);
      const inode = stat.ino ? String(stat.ino) : null;
      const hardLinks = stat.nlink || 0;

      const existing = existingMap.get(fullPath);
      const unchanged = existing
        ? existing.modifiedAt === modifiedAt &&
          Number(existing.sizeBytes) === Number(stat.size) &&
          Number(existing.isDir) === (stat.isDirectory() ? 1 : 0) &&
          Number(existing.isSymlink) === (isSymlink ? 1 : 0)
        : false;

      if (unchanged) {
        seenPaths.add(fullPath);
        reportProgress(fullPath);
        if (stat.isDirectory()) {
          await walk(fullPath);
        }
        continue;
      }

      let owner = null;
      let isHidden = entry.name.startsWith(".");
      let isSystem = false;

      if (!stat.isDirectory()) {
        const ownerInfo = await getOwnerAndAttributes(fullPath);
        owner = ownerInfo.owner;
        if (process.platform === "win32") {
          isHidden = ownerInfo.isHidden;
          isSystem = ownerInfo.isSystem;
        }
      }

      if (stat.isDirectory()) {
        await upsertRecord({
          path: fullPath,
          name: entry.name,
          ext: null,
          type: "Folder",
          sizeBytes: 0,
          createdAt,
          modifiedAt,
          accessedAt,
          owner,
          permissions,
          inode,
          hardLinks,
          hash: null,
          isSymlink: isSymlink ? 1 : 0,
          isHidden: isHidden ? 1 : 0,
          isSystem: isSystem ? 1 : 0,
          isDir: 1
        });

        seenPaths.add(fullPath);
        reportProgress(fullPath);
        await walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const type = isSymlink ? "Symlink" : classifyExt(ext);
      const hash = isSymlink ? null : await hashFile(fullPath, stat.size);

      await upsertRecord({
        path: fullPath,
        name: entry.name,
        ext,
        type,
        sizeBytes: stat.size,
        createdAt,
        modifiedAt,
        accessedAt,
        owner,
        permissions,
        inode,
        hardLinks,
        hash,
        isSymlink: isSymlink ? 1 : 0,
        isHidden: isHidden ? 1 : 0,
        isSystem: isSystem ? 1 : 0,
        isDir: 0
      });

      seenPaths.add(fullPath);
      reportProgress(fullPath);
    }
  }

  await db.exec("BEGIN");

  try {
    await walk(rootPath);

    if (incremental) {
      const rows = await db.all("SELECT path FROM files WHERE scan_id = ?", [scanId]);
      const removed = rows.filter((row) => !seenPaths.has(row.path));

      if (removed.length) {
        const deleteStmt = await db.prepare("DELETE FROM files WHERE scan_id = ? AND path = ?");
        for (const row of removed) {
          await deleteStmt.run(scanId, row.path);
        }
        await deleteStmt.finalize();
      }
    }

    await insertStmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await insertStmt.finalize();
    await db.exec("ROLLBACK");
    throw error;
  }

  await updateScanSummary(db, scanId);

  if (onProgress) {
    onProgress({ processed: processedCount, path: rootPath, done: true });
  }

  const scan = await db.get(
    `
      SELECT
        id as scanId,
        root_path as rootPath,
        started_at as startedAt,
        completed_at as completedAt,
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

  return scan;
}

export async function refreshScanSummary(db, scanId) {
  await updateScanSummary(db, scanId);
}
