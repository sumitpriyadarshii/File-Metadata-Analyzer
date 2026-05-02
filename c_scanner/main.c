#define _CRT_SECURE_NO_WARNINGS
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <wincrypt.h>
#include <aclapi.h>
#include <sddl.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <wchar.h>

#include "sqlite3.h"

#ifndef CALG_SHA_256
#define CALG_SHA_256 0x0000800c
#endif

#define HASH_BUFFER_SIZE 65536

typedef struct {
  int64_t total_files;
  int64_t total_folders;
  int64_t total_size;
  bool oldest_set;
  FILETIME oldest_time;
  char *oldest_path;
} ScanStats;

static const wchar_t *IGNORED_DIRS[] = {
  L"$RECYCLE.BIN",
  L"System Volume Information",
  L"node_modules",
  L".git",
  NULL
};

static bool is_ignored_dir(const wchar_t *name) {
  for (int i = 0; IGNORED_DIRS[i] != NULL; i += 1) {
    if (_wcsicmp(name, IGNORED_DIRS[i]) == 0) {
      return true;
    }
  }
  return false;
}

static char *wide_to_utf8(const wchar_t *value) {
  if (!value) {
    return NULL;
  }

  int size = WideCharToMultiByte(CP_UTF8, 0, value, -1, NULL, 0, NULL, NULL);
  if (size <= 0) {
    return NULL;
  }

  char *buffer = (char *)malloc((size_t)size);
  if (!buffer) {
    return NULL;
  }

  WideCharToMultiByte(CP_UTF8, 0, value, -1, buffer, size, NULL, NULL);
  return buffer;
}

static wchar_t *utf8_to_wide(const char *value) {
  if (!value) {
    return NULL;
  }

  int size = MultiByteToWideChar(CP_UTF8, 0, value, -1, NULL, 0);
  if (size <= 0) {
    return NULL;
  }

  wchar_t *buffer = (wchar_t *)malloc((size_t)size * sizeof(wchar_t));
  if (!buffer) {
    return NULL;
  }

  MultiByteToWideChar(CP_UTF8, 0, value, -1, buffer, size);
  return buffer;
}

static char *format_filetime_iso(const FILETIME *ft) {
  if (!ft) {
    return NULL;
  }

  SYSTEMTIME st;
  if (!FileTimeToSystemTime(ft, &st)) {
    return NULL;
  }

  char *buffer = (char *)malloc(25);
  if (!buffer) {
    return NULL;
  }

  snprintf(
    buffer,
    25,
    "%04d-%02d-%02dT%02d:%02d:%02d.000Z",
    st.wYear,
    st.wMonth,
    st.wDay,
    st.wHour,
    st.wMinute,
    st.wSecond
  );

  return buffer;
}

static char *get_owner_utf8(const wchar_t *path) {
  PSID owner_sid = NULL;
  PSECURITY_DESCRIPTOR sd = NULL;
  DWORD result = GetNamedSecurityInfoW(
    (LPWSTR)path,
    SE_FILE_OBJECT,
    OWNER_SECURITY_INFORMATION,
    &owner_sid,
    NULL,
    NULL,
    NULL,
    &sd
  );

  if (result != ERROR_SUCCESS || owner_sid == NULL) {
    if (sd) {
      LocalFree(sd);
    }
    return NULL;
  }

  wchar_t name[256];
  wchar_t domain[256];
  DWORD name_len = 256;
  DWORD domain_len = 256;
  SID_NAME_USE use;

  if (LookupAccountSidW(NULL, owner_sid, name, &name_len, domain, &domain_len, &use)) {
    wchar_t combined[520];
    _snwprintf(combined, 520, L"%s\\%s", domain, name);
    char *owner = wide_to_utf8(combined);
    LocalFree(sd);
    return owner;
  }

  LPWSTR sid_str = NULL;
  if (ConvertSidToStringSidW(owner_sid, &sid_str)) {
    char *owner = wide_to_utf8(sid_str);
    LocalFree(sid_str);
    LocalFree(sd);
    return owner;
  }

  LocalFree(sd);
  return NULL;
}

static char *hash_file_sha256(const wchar_t *path, uint64_t size_bytes) {
  char *env = NULL;
  size_t env_len = 0;
  uint64_t max_bytes = 0;

  if (_dupenv_s(&env, &env_len, "HASH_MAX_BYTES") == 0 && env) {
    max_bytes = (uint64_t)_strtoui64(env, NULL, 10);
    free(env);
  }

  if (max_bytes > 0 && size_bytes > max_bytes) {
    return NULL;
  }

  HCRYPTPROV h_prov = 0;
  HCRYPTHASH h_hash = 0;
  HANDLE file = INVALID_HANDLE_VALUE;
  BYTE buffer[HASH_BUFFER_SIZE];
  DWORD bytes_read = 0;

  if (!CryptAcquireContextW(&h_prov, NULL, NULL, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) {
    return NULL;
  }

  if (!CryptCreateHash(h_prov, CALG_SHA_256, 0, 0, &h_hash)) {
    CryptReleaseContext(h_prov, 0);
    return NULL;
  }

  file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) {
    CryptDestroyHash(h_hash);
    CryptReleaseContext(h_prov, 0);
    return NULL;
  }

  while (ReadFile(file, buffer, HASH_BUFFER_SIZE, &bytes_read, NULL) && bytes_read > 0) {
    if (!CryptHashData(h_hash, buffer, bytes_read, 0)) {
      CloseHandle(file);
      CryptDestroyHash(h_hash);
      CryptReleaseContext(h_prov, 0);
      return NULL;
    }
  }

  CloseHandle(file);

  BYTE hash_val[32];
  DWORD hash_len = sizeof(hash_val);
  if (!CryptGetHashParam(h_hash, HP_HASHVAL, hash_val, &hash_len, 0)) {
    CryptDestroyHash(h_hash);
    CryptReleaseContext(h_prov, 0);
    return NULL;
  }

  CryptDestroyHash(h_hash);
  CryptReleaseContext(h_prov, 0);

  char *hex = (char *)malloc(hash_len * 2 + 1);
  if (!hex) {
    return NULL;
  }

  for (DWORD i = 0; i < hash_len; i += 1) {
    sprintf(hex + i * 2, "%02x", hash_val[i]);
  }
  hex[hash_len * 2] = '\0';

  return hex;
}

static bool get_file_info(const wchar_t *path, uint64_t *hard_links, char **inode_out) {
  HANDLE handle = CreateFileW(
    path,
    0,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    NULL,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS,
    NULL
  );

  if (handle == INVALID_HANDLE_VALUE) {
    return false;
  }

  BY_HANDLE_FILE_INFORMATION info;
  if (!GetFileInformationByHandle(handle, &info)) {
    CloseHandle(handle);
    return false;
  }

  if (hard_links) {
    *hard_links = (uint64_t)info.nNumberOfLinks;
  }

  if (inode_out) {
    uint64_t inode = ((uint64_t)info.nFileIndexHigh << 32) | info.nFileIndexLow;
    char *buf = (char *)malloc(32);
    if (buf) {
      snprintf(buf, 32, "%llu", (unsigned long long)inode);
      *inode_out = buf;
    }
  }

  CloseHandle(handle);
  return true;
}

static int exec_sql(sqlite3 *db, const char *sql) {
  char *err = NULL;
  int rc = sqlite3_exec(db, sql, NULL, NULL, &err);
  if (rc != SQLITE_OK) {
    if (err) {
      sqlite3_free(err);
    }
  }
  return rc;
}

static int bind_text(sqlite3_stmt *stmt, int idx, const char *value) {
  if (!value) {
    return sqlite3_bind_null(stmt, idx);
  }
  return sqlite3_bind_text(stmt, idx, value, -1, SQLITE_TRANSIENT);
}

static int bind_int64(sqlite3_stmt *stmt, int idx, int64_t value) {
  return sqlite3_bind_int64(stmt, idx, value);
}

static int insert_seen(sqlite3_stmt *stmt, const char *path) {
  sqlite3_reset(stmt);
  sqlite3_clear_bindings(stmt);
  bind_text(stmt, 1, path);
  return sqlite3_step(stmt);
}

static int insert_file(
  sqlite3_stmt *stmt,
  int64_t scan_id,
  const char *path_utf8,
  const char *name_utf8,
  const char *ext_utf8,
  const char *type_utf8,
  int64_t size_bytes,
  const char *created_at,
  const char *modified_at,
  const char *accessed_at,
  const char *owner,
  const char *permissions,
  const char *inode,
  int64_t hard_links,
  const char *hash,
  int is_symlink,
  int is_hidden,
  int is_system,
  int is_dir
) {
  sqlite3_reset(stmt);
  sqlite3_clear_bindings(stmt);

  bind_int64(stmt, 1, scan_id);
  bind_text(stmt, 2, path_utf8);
  bind_text(stmt, 3, name_utf8);
  bind_text(stmt, 4, ext_utf8);
  bind_text(stmt, 5, type_utf8);
  bind_int64(stmt, 6, size_bytes);
  bind_text(stmt, 7, created_at);
  bind_text(stmt, 8, modified_at);
  bind_text(stmt, 9, accessed_at);
  bind_text(stmt, 10, owner);
  bind_text(stmt, 11, permissions);
  bind_text(stmt, 12, inode);
  bind_int64(stmt, 13, hard_links);
  bind_text(stmt, 14, hash);
  bind_int64(stmt, 15, is_symlink);
  bind_int64(stmt, 16, is_hidden);
  bind_int64(stmt, 17, is_system);
  bind_int64(stmt, 18, is_dir);

  return sqlite3_step(stmt);
}

static void update_oldest(ScanStats *stats, const FILETIME *created, const char *path_utf8) {
  if (!created || !path_utf8) {
    return;
  }

  if (!stats->oldest_set || CompareFileTime(created, &stats->oldest_time) < 0) {
    stats->oldest_set = true;
    stats->oldest_time = *created;
    if (stats->oldest_path) {
      free(stats->oldest_path);
    }
    stats->oldest_path = _strdup(path_utf8);
  }
}

static int scan_directory(
  const wchar_t *root,
  sqlite3_stmt *insert_stmt,
  sqlite3_stmt *seen_stmt,
  int64_t scan_id,
  ScanStats *stats,
  bool incremental
) {
  wchar_t pattern[MAX_PATH * 2];
  _snwprintf(pattern, MAX_PATH * 2, L"%s\\*", root);

  WIN32_FIND_DATAW data;
  HANDLE h_find = FindFirstFileW(pattern, &data);
  if (h_find == INVALID_HANDLE_VALUE) {
    return 0;
  }

  do {
    if (wcscmp(data.cFileName, L".") == 0 || wcscmp(data.cFileName, L"..") == 0) {
      continue;
    }

    if ((data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) && is_ignored_dir(data.cFileName)) {
      continue;
    }

    wchar_t full_path[MAX_PATH * 2];
    _snwprintf(full_path, MAX_PATH * 2, L"%s\\%s", root, data.cFileName);

    bool is_dir = (data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
    bool is_symlink = (data.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
    bool is_hidden = (data.dwFileAttributes & FILE_ATTRIBUTE_HIDDEN) != 0;
    bool is_system = (data.dwFileAttributes & FILE_ATTRIBUTE_SYSTEM) != 0;

    uint64_t size_bytes = ((uint64_t)data.nFileSizeHigh << 32) | data.nFileSizeLow;

    char *path_utf8 = wide_to_utf8(full_path);
    char *name_utf8 = wide_to_utf8(data.cFileName);
    char *created_at = format_filetime_iso(&data.ftCreationTime);
    char *modified_at = format_filetime_iso(&data.ftLastWriteTime);
    char *accessed_at = format_filetime_iso(&data.ftLastAccessTime);

    char *owner = NULL;
    char *inode = NULL;
    uint64_t hard_links = 0;

    if (get_file_info(full_path, &hard_links, &inode)) {
      // ok
    }

    if (!is_dir) {
      owner = get_owner_utf8(full_path);
    }

    if (!owner) {
      char *env = NULL;
      size_t env_len = 0;
      if (_dupenv_s(&env, &env_len, "USERNAME") == 0 && env) {
        owner = env;
      }
    }

    const char *type = is_dir ? "Folder" : (is_symlink ? "Symlink" : "File");
    const wchar_t *ext_ptr = wcsrchr(data.cFileName, L'.');
    char *ext_utf8 = ext_ptr ? wide_to_utf8(ext_ptr) : NULL;

    char *hash = NULL;
    if (!is_dir && !is_symlink) {
      hash = hash_file_sha256(full_path, size_bytes);
    }

    insert_file(
      insert_stmt,
      scan_id,
      path_utf8,
      name_utf8,
      ext_utf8,
      type,
      is_dir ? 0 : (int64_t)size_bytes,
      created_at,
      modified_at,
      accessed_at,
      owner,
      NULL,
      inode,
      (int64_t)hard_links,
      hash,
      is_symlink ? 1 : 0,
      is_hidden ? 1 : 0,
      is_system ? 1 : 0,
      is_dir ? 1 : 0
    );

    if (incremental && seen_stmt && path_utf8) {
      insert_seen(seen_stmt, path_utf8);
    }

    if (is_dir) {
      stats->total_folders += 1;
    } else {
      stats->total_files += 1;
      stats->total_size += (int64_t)size_bytes;
      update_oldest(stats, &data.ftCreationTime, path_utf8);
    }

    if (path_utf8) free(path_utf8);
    if (name_utf8) free(name_utf8);
    if (ext_utf8) free(ext_utf8);
    if (created_at) free(created_at);
    if (modified_at) free(modified_at);
    if (accessed_at) free(accessed_at);
    if (owner) free(owner);
    if (inode) free(inode);
    if (hash) free(hash);

    if (is_dir && !is_symlink) {
      scan_directory(full_path, insert_stmt, seen_stmt, scan_id, stats, incremental);
    }
  } while (FindNextFileW(h_find, &data));

  FindClose(h_find);
  return 0;
}

static void print_usage(void) {
  printf("Usage: c_scanner.exe <path> [--db <db_path>] [--incremental]\n");
}

int wmain(int argc, wchar_t **argv) {
  if (argc < 2) {
    print_usage();
    return 1;
  }

  const wchar_t *target_path = NULL;
  wchar_t *db_path = NULL;
  bool incremental = false;

  for (int i = 1; i < argc; i += 1) {
    if (wcscmp(argv[i], L"--db") == 0 && i + 1 < argc) {
      db_path = _wcsdup(argv[i + 1]);
      i += 1;
      continue;
    }

    if (wcscmp(argv[i], L"--incremental") == 0 || wcscmp(argv[i], L"-i") == 0) {
      incremental = true;
      continue;
    }

    if (!target_path) {
      target_path = argv[i];
    }
  }

  if (!target_path) {
    print_usage();
    return 1;
  }

  if (!db_path) {
    db_path = _wcsdup(L"..\\backend\\data\\filemeta.db");
  }

  char *db_path_utf8 = wide_to_utf8(db_path);
  sqlite3 *db = NULL;
  if (sqlite3_open(db_path_utf8, &db) != SQLITE_OK) {
    printf("Failed to open database.\n");
    if (db_path_utf8) free(db_path_utf8);
    free(db_path);
    return 1;
  }

  exec_sql(db, "PRAGMA journal_mode = WAL;");
  exec_sql(db,
    "CREATE TABLE IF NOT EXISTS scans ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "root_path TEXT NOT NULL,"
    "started_at TEXT NOT NULL,"
    "completed_at TEXT,"
    "total_files INTEGER DEFAULT 0,"
    "total_folders INTEGER DEFAULT 0,"
    "total_size_bytes INTEGER DEFAULT 0,"
    "oldest_file_path TEXT,"
    "oldest_file_created_at TEXT"
    ");"
  );
  exec_sql(db,
    "CREATE TABLE IF NOT EXISTS files ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "scan_id INTEGER NOT NULL,"
    "path TEXT NOT NULL,"
    "name TEXT NOT NULL,"
    "ext TEXT,"
    "type TEXT,"
    "size_bytes INTEGER DEFAULT 0,"
    "created_at TEXT,"
    "modified_at TEXT,"
    "accessed_at TEXT,"
    "owner TEXT,"
    "permissions TEXT,"
    "inode TEXT,"
    "hard_links INTEGER DEFAULT 0,"
    "hash TEXT,"
    "is_symlink INTEGER DEFAULT 0,"
    "is_hidden INTEGER DEFAULT 0,"
    "is_system INTEGER DEFAULT 0,"
    "is_dir INTEGER DEFAULT 0,"
    "FOREIGN KEY(scan_id) REFERENCES scans(id)"
    ");"
  );
  exec_sql(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_files_unique ON files(scan_id, path);");

  sqlite3_stmt *scan_lookup = NULL;
  sqlite3_stmt *scan_insert = NULL;
  sqlite3_stmt *insert_stmt = NULL;
  sqlite3_stmt *seen_stmt = NULL;

  const char *scan_lookup_sql = "SELECT id FROM scans WHERE root_path = ? ORDER BY id DESC LIMIT 1";
  sqlite3_prepare_v2(db, scan_lookup_sql, -1, &scan_lookup, NULL);

  const char *scan_insert_sql = "INSERT INTO scans (root_path, started_at) VALUES (?, ?)";
  sqlite3_prepare_v2(db, scan_insert_sql, -1, &scan_insert, NULL);

  const char *insert_sql =
    "INSERT INTO files (scan_id, path, name, ext, type, size_bytes, created_at, modified_at, accessed_at, owner, permissions, inode, hard_links, hash, is_symlink, is_hidden, is_system, is_dir)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    " ON CONFLICT(scan_id, path) DO UPDATE SET"
    " name = excluded.name,"
    " ext = excluded.ext,"
    " type = excluded.type,"
    " size_bytes = excluded.size_bytes,"
    " created_at = excluded.created_at,"
    " modified_at = excluded.modified_at,"
    " accessed_at = excluded.accessed_at,"
    " owner = excluded.owner,"
    " permissions = excluded.permissions,"
    " inode = excluded.inode,"
    " hard_links = excluded.hard_links,"
    " hash = excluded.hash,"
    " is_symlink = excluded.is_symlink,"
    " is_hidden = excluded.is_hidden,"
    " is_system = excluded.is_system,"
    " is_dir = excluded.is_dir";
  sqlite3_prepare_v2(db, insert_sql, -1, &insert_stmt, NULL);

  if (incremental) {
    exec_sql(db, "CREATE TEMP TABLE IF NOT EXISTS temp_seen (path TEXT PRIMARY KEY);");
    sqlite3_prepare_v2(db, "INSERT OR IGNORE INTO temp_seen (path) VALUES (?)", -1, &seen_stmt, NULL);
  }

  int64_t scan_id = 0;
  char *target_utf8 = wide_to_utf8(target_path);

  if (incremental) {
    sqlite3_reset(scan_lookup);
    sqlite3_clear_bindings(scan_lookup);
    bind_text(scan_lookup, 1, target_utf8);

    if (sqlite3_step(scan_lookup) == SQLITE_ROW) {
      scan_id = sqlite3_column_int64(scan_lookup, 0);
    }
  }

  if (scan_id == 0) {
    char *started_at = NULL;
    FILETIME ft;
    GetSystemTimeAsFileTime(&ft);
    started_at = format_filetime_iso(&ft);

    sqlite3_reset(scan_insert);
    sqlite3_clear_bindings(scan_insert);
    bind_text(scan_insert, 1, target_utf8);
    bind_text(scan_insert, 2, started_at);
    sqlite3_step(scan_insert);
    scan_id = sqlite3_last_insert_rowid(db);

    if (started_at) free(started_at);
  }

  exec_sql(db, "BEGIN");

  ScanStats stats = {0};
  scan_directory(target_path, insert_stmt, seen_stmt, scan_id, &stats, incremental);

  if (incremental) {
    const char *delete_sql = "DELETE FROM files WHERE scan_id = ? AND path NOT IN (SELECT path FROM temp_seen)";
    sqlite3_stmt *delete_stmt = NULL;
    sqlite3_prepare_v2(db, delete_sql, -1, &delete_stmt, NULL);
    sqlite3_bind_int64(delete_stmt, 1, scan_id);
    sqlite3_step(delete_stmt);
    sqlite3_finalize(delete_stmt);
    exec_sql(db, "DELETE FROM temp_seen;");
  }

  exec_sql(db, "COMMIT");

  char *completed_at = NULL;
  FILETIME ft;
  GetSystemTimeAsFileTime(&ft);
  completed_at = format_filetime_iso(&ft);
  char *oldest_created = stats.oldest_set ? format_filetime_iso(&stats.oldest_time) : NULL;

  sqlite3_stmt *update_stmt = NULL;
  const char *update_sql =
    "UPDATE scans SET completed_at = ?, total_files = ?, total_folders = ?, total_size_bytes = ?, oldest_file_path = ?, oldest_file_created_at = ? WHERE id = ?";
  sqlite3_prepare_v2(db, update_sql, -1, &update_stmt, NULL);
  bind_text(update_stmt, 1, completed_at);
  bind_int64(update_stmt, 2, stats.total_files);
  bind_int64(update_stmt, 3, stats.total_folders);
  bind_int64(update_stmt, 4, stats.total_size);
  bind_text(update_stmt, 5, stats.oldest_path);
  bind_text(update_stmt, 6, oldest_created);
  bind_int64(update_stmt, 7, scan_id);
  sqlite3_step(update_stmt);
  sqlite3_finalize(update_stmt);

  if (completed_at) free(completed_at);
  if (oldest_created) free(oldest_created);
  if (stats.oldest_path) free(stats.oldest_path);
  if (target_utf8) free(target_utf8);

  if (seen_stmt) sqlite3_finalize(seen_stmt);
  sqlite3_finalize(insert_stmt);
  sqlite3_finalize(scan_lookup);
  sqlite3_finalize(scan_insert);

  sqlite3_close(db);

  printf("Scan complete.\n");
  printf("Scan ID: %lld\n", (long long)scan_id);
  printf("Total files: %lld\n", (long long)stats.total_files);
  printf("Total folders: %lld\n", (long long)stats.total_folders);
  printf("Total size bytes: %lld\n", (long long)stats.total_size);

  free(db_path_utf8);
  free(db_path);
  return 0;
}
