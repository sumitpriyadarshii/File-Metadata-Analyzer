# File Metadata Analyzer

This project scans a directory, stores file metadata in SQLite, and shows a dashboard UI with real-time updates.

## Structure
- frontend: static dashboard UI
- backend: Express API and SQLite storage

## Run locally
1. Open a terminal in backend
2. npm install
3. npm run dev
4. Open http://localhost:4000

## Scan a directory
- Click Scan Directory and enter a full path, for example:
  C:\Users\Sumit\Documents

The scan runs as a background job. The UI polls status until completion.

## Advanced backend endpoints
- POST /api/scan (body: { path, incremental }) -> returns jobId
- GET /api/status/:jobId -> job state and result
- GET /api/search -> advanced filters (name, owner, size, date)
- GET /api/duplicates -> hash-based duplicate groups
- GET /api/aging?days=90 -> old/unused files
- GET /api/dir-summary?depth=2 -> folder-level totals
- GET /api/export?format=csv|json -> report export

## CLI scan
- npm run scan -- "C:\Users\Sumit\Documents"
- npm run scan -- --incremental "C:\Users\Sumit\Documents"

## Optional C scanner (keeps Node backend intact)
If your course requires C, you can use the C scanner to write into the same SQLite DB.
See [c_scanner/README.md](c_scanner/README.md) for build/run steps.
