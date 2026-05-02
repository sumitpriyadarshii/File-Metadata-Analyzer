import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = process.env.VERCEL ? "/tmp" : path.join(rootDir, "data");
const dbPath = path.join(dataDir, "filemeta.db");

export async function openDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA journal_mode = WAL;");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_files INTEGER DEFAULT 0,
      total_folders INTEGER DEFAULT 0,
      total_size_bytes INTEGER DEFAULT 0,
      oldest_file_path TEXT,
      oldest_file_created_at TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      ext TEXT,
      type TEXT,
      size_bytes INTEGER DEFAULT 0,
      created_at TEXT,
      modified_at TEXT,
      accessed_at TEXT,
      owner TEXT,
      permissions TEXT,
      inode TEXT,
      hard_links INTEGER DEFAULT 0,
      hash TEXT,
      is_symlink INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      is_dir INTEGER DEFAULT 0,
      FOREIGN KEY(scan_id) REFERENCES scans(id)
    );
  `);

  async function addColumnIfMissing(tableName, columnName, definition) {
    const columns = await db.all(`PRAGMA table_info(${tableName});`);
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
    }
  }

  await addColumnIfMissing("files", "accessed_at", "TEXT");
  await addColumnIfMissing("files", "permissions", "TEXT");
  await addColumnIfMissing("files", "inode", "TEXT");
  await addColumnIfMissing("files", "hard_links", "INTEGER DEFAULT 0");
  await addColumnIfMissing("files", "hash", "TEXT");
  await addColumnIfMissing("files", "is_symlink", "INTEGER DEFAULT 0");
  await addColumnIfMissing("files", "is_hidden", "INTEGER DEFAULT 0");
  await addColumnIfMissing("files", "is_system", "INTEGER DEFAULT 0");

  await db.exec("CREATE INDEX IF NOT EXISTS idx_files_scan ON files(scan_id);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_files_size ON files(scan_id, size_bytes);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_files_hash ON files(scan_id, hash);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_files_owner ON files(scan_id, owner);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_files_name ON files(scan_id, name);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_files_path ON files(scan_id, path);");
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_files_unique ON files(scan_id, path);");

  return db;
}
