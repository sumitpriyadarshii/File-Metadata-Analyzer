# C Scanner (Optional)

This module adds a C-based scanner that writes metadata into the same SQLite database used by the Node backend.
It does NOT replace Node; it is an additional scanner you can run separately.

## What it does
- Recursively scans a directory
- Writes file metadata into backend/data/filemeta.db
- Supports incremental scans to update only changes
- Computes SHA-256 hashes (used for duplicates)

## Build (Windows)

### Option A: MinGW
1. Install MSYS2 + MinGW-w64 and SQLite dev libs.
2. From MSYS2 MinGW shell:

```
cd /d/CSE\ 316\ project/c_scanner
gcc -O2 -o c_scanner.exe main.c -lsqlite3 -ladvapi32
```

### Option B: MSVC (Developer Command Prompt)
1. Install SQLite dev package (headers + libs) and ensure `sqlite3.lib` is on the LIB path.
2. Build:

```
cd /d "D:\CSE 316 project\c_scanner"
cl /O2 /EHsc main.c sqlite3.lib Advapi32.lib
```

## Run

```
# Full scan
c_scanner.exe "D:\CSE 316 project"

# Incremental scan (reuse last scan for the same root)
c_scanner.exe "D:\CSE 316 project" --incremental

# Custom DB path
c_scanner.exe "D:\CSE 316 project" --db "D:\CSE 316 project\backend\data\filemeta.db"
```

## Notes
- The Node backend remains the primary API server.
- The C scanner only writes data into SQLite.
- The UI will display the C scan data after refresh.
