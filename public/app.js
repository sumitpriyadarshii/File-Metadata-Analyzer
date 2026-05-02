const API_BASE = "/api";

const sampleData = {
  summary: {
    totalFiles: 1248,
    totalFolders: 156,
    totalSizeBytes: 2450000000,
    oldestFileDate: "2021-03-12T00:00:00.000Z",
    oldestFilePath: "C:\\DemoData\\Project_Proposal.docx"
  },
  files: [
    {
      name: "Project_Proposal.docx",
      type: "Documents",
      ext: ".docx",
      sizeBytes: 24576,
      createdAt: "2021-03-12T10:15:00.000Z",
      modifiedAt: "2021-03-12T10:15:00.000Z",
      permissions: "rw-r--r--",
      owner: "Admin",
      path: "C:\\DemoData\\Project_Proposal.docx"
    },
    {
      name: "System_Design.pptx",
      type: "Documents",
      ext: ".pptx",
      sizeBytes: 2450000,
      createdAt: "2023-04-18T09:20:00.000Z",
      modifiedAt: "2023-04-18T09:20:00.000Z",
      permissions: "rw-r--r--",
      owner: "Admin",
      path: "C:\\DemoData\\System_Design.pptx"
    },
    {
      name: "Data_Analysis.xlsx",
      type: "Documents",
      ext: ".xlsx",
      sizeBytes: 532000,
      createdAt: "2023-05-09T14:35:00.000Z",
      modifiedAt: "2023-05-09T14:35:00.000Z",
      permissions: "rw-r--r--",
      owner: "Admin",
      path: "C:\\DemoData\\Data_Analysis.xlsx"
    },
    {
      name: "Project_Report.pdf",
      type: "Documents",
      ext: ".pdf",
      sizeBytes: 1120000,
      createdAt: "2023-06-21T11:45:00.000Z",
      modifiedAt: "2023-06-21T11:45:00.000Z",
      permissions: "rw-r--r--",
      owner: "Admin",
      path: "C:\\DemoData\\Project_Report.pdf"
    },
    {
      name: "Screenshot.png",
      type: "Images",
      ext: ".png",
      sizeBytes: 1230000,
      createdAt: "2023-07-02T13:10:00.000Z",
      modifiedAt: "2023-07-02T13:10:00.000Z",
      permissions: "rw-r--r--",
      owner: "Admin",
      path: "C:\\DemoData\\Screenshot.png"
    }
  ],
  fileTypes: [
    { type: "Documents", count: 462 },
    { type: "Images", count: 340 },
    { type: "Videos", count: 185 },
    { type: "Archives", count: 95 },
    { type: "Code", count: 86 },
    { type: "Other", count: 80 }
  ],
  largest: [
    { name: "Windows11-22H2.iso", sizeBytes: 4690000000, path: "C:\\Downloads\\Windows11-22H2.iso" },
    { name: "Project_Video.mp4", sizeBytes: 512000000, path: "C:\\DemoData\\Project_Video.mp4" },
    { name: "Dataset_Backup.zip", sizeBytes: 256000000, path: "C:\\DemoData\\Dataset_Backup.zip" },
    { name: "System_Image.png", sizeBytes: 128000000, path: "C:\\DemoData\\System_Image.png" },
    { name: "VirtualBox-6.1.50.exe", sizeBytes: 103450000, path: "C:\\Installers\\VirtualBox-6.1.50.exe" }
  ],
  sizeBuckets: [
    { label: "0 - 10 KB", count: 210 },
    { label: "10 KB - 1 MB", count: 420 },
    { label: "1 MB - 10 MB", count: 320 },
    { label: "10 MB - 100 MB", count: 210 },
    { label: "100+ MB", count: 88 }
  ],
  scans: [
    {
      id: 31,
      rootPath: "C:\\DemoData",
      startedAt: "2024-04-28T09:05:00.000Z",
      completedAt: "2024-04-28T09:07:00.000Z",
      totalFiles: 1248
    },
    {
      id: 30,
      rootPath: "C:\\Downloads",
      startedAt: "2024-04-27T18:10:00.000Z",
      completedAt: "2024-04-27T18:13:00.000Z",
      totalFiles: 980
    }
  ],
  aging: [
    {
      name: "Project_Proposal.docx",
      path: "C:\\DemoData\\Project_Proposal.docx",
      sizeBytes: 24576,
      modifiedAt: "2021-03-12T10:15:00.000Z",
      owner: "Admin"
    },
    {
      name: "System_Design.pptx",
      path: "C:\\DemoData\\System_Design.pptx",
      sizeBytes: 2450000,
      modifiedAt: "2023-04-18T09:20:00.000Z",
      owner: "Admin"
    }
  ],
  dirSummary: [
    {
      path: "C:\\DemoData",
      totalFiles: 4,
      totalSizeBytes: 4377576
    },
    {
      path: "C:\\Downloads",
      totalFiles: 1,
      totalSizeBytes: 4690000000
    }
  ]
};

const defaultSettings = {
  autoRefresh: false,
  compactTable: false,
  sampleFallback: true
};

const state = {
  summary: {},
  files: [],
  allFiles: [],
  allOffset: 0,
  allLimit: 50,
  searchResults: [],
  searchOffset: 0,
  searchLimit: 50,
  fileTypes: [],
  sizeBuckets: [],
  largest: [],
  scans: [],
  agingFiles: [],
  dirSummary: [],
  charts: {},
  activeView: "dashboard",
  settings: { ...defaultSettings },
  autoRefreshTimer: null,
  scanPollTimer: null,
  timeUpdateTimer: null,
  currentJobId: null,
  ws: null,
  scanActive: false,
  watchActive: false
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const result = value / Math.pow(1024, idx);
  const precision = result >= 10 || idx === 0 ? 0 : 1;
  return `${result.toFixed(precision)} ${units[idx]}`;
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleDateString();
}

// Utility: debounce to limit frequent expensive operations
function debounce(fn, wait) {
  let t = null;
  return function (...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      try { fn.apply(this, args); } catch (e) { console.error(e); }
    }, wait);
  };
}

function shortenPath(pathValue) {
  if (!pathValue) {
    return "-";
  }
  if (pathValue.length <= 34) {
    return pathValue;
  }
  return `${pathValue.slice(0, 31)}...`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem("fma-settings");
    const parsed = raw ? JSON.parse(raw) : {};
    state.settings = { ...defaultSettings, ...parsed };
  } catch (error) {
    state.settings = { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem("fma-settings", JSON.stringify(state.settings));
}

function applySettings() {
  document.body.classList.toggle("compact", state.settings.compactTable);

  if (state.settings.autoRefresh) {
    if (!state.autoRefreshTimer) {
      state.autoRefreshTimer = setInterval(() => {
        loadCoreData();
      }, 60000);
    }
  } else if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }

  syncSettingsUI();
}

function syncSettingsUI() {
  const autoRefresh = document.getElementById("settingAutoRefresh");
  const compact = document.getElementById("settingCompactTable");
  const sampleFallback = document.getElementById("settingSampleFallback");

  if (autoRefresh) autoRefresh.checked = state.settings.autoRefresh;
  if (compact) compact.checked = state.settings.compactTable;
  if (sampleFallback) sampleFallback.checked = state.settings.sampleFallback;
}

function isDemoMode() {
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

// Make the initial sample data always look like it was scanned today
const now = new Date();
sampleData.scans[0].completedAt = new Date(now.getTime() - 1000 * 60 * 5).toISOString();
sampleData.scans[0].startedAt = new Date(now.getTime() - 1000 * 60 * 7).toISOString();
sampleData.scans[1].completedAt = new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString();
sampleData.scans[1].startedAt = new Date(now.getTime() - 1000 * 60 * 60 * 2 - 1000 * 60 * 3).toISOString();

let mockScanStatus = "queued";
let mockScanId = 32;

async function fetchJson(url, options) {
  if (isDemoMode()) {
    await new Promise(r => setTimeout(r, 400)); // fake network latency

    if (url.includes("/scan")) {
      mockScanStatus = "running";
      setTimeout(() => { 
        mockScanStatus = "completed"; 
        
        // Dynamically add a brand new scan to the history when the fake scan completes
        const path = options && options.body ? JSON.parse(options.body).path : "User Directory";
        const newScan = {
          id: mockScanId++,
          rootPath: path || "Scanned Directory",
          startedAt: new Date(Date.now() - 2500).toISOString(),
          completedAt: new Date().toISOString(),
          totalFiles: Math.floor(Math.random() * 2000) + 500
        };
        sampleData.scans.unshift(newScan);
        
        // Bump up the summary stats to make it feel alive
        sampleData.summary.totalFiles += newScan.totalFiles;
        sampleData.summary.totalSizeBytes += Math.floor(Math.random() * 500000000) + 100000000;

      }, 2500); 
      return { jobId: "demo-job-123", status: "queued" };
    }
    if (url.includes("/status")) {
      return { status: mockScanStatus };
    }
    
    if (url.includes("/summary")) return sampleData.summary;
    if (url.includes("/files") || url.includes("/search") || url.includes("/all")) return { items: sampleData.files };
    if (url.includes("/file-types")) return { items: sampleData.fileTypes };
    if (url.includes("/largest")) return { items: sampleData.largest };
    if (url.includes("/size-buckets")) return { items: sampleData.sizeBuckets };
    if (url.includes("/recent-scans")) return { items: sampleData.scans };
    if (url.includes("/aging")) return { items: sampleData.aging, cutoff: new Date().toISOString() };
    if (url.includes("/dir-summary")) return { items: sampleData.dirSummary };
    if (url.includes("/duplicates")) return { items: [] };
    if (url.includes("/watch")) return { active: false };
    if (url.includes("/system-info")) {
      return {
        os: "Windows",
        release: "10.0.22631",
        arch: "x64",
        cpuModel: "Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz",
        cpuCount: 16,
        totalMemory: 32,
        freeMemory: 18,
        usedMemory: 14,
        uptime: 345600,
        hostname: "Admin",
        username: "Admin",
        nodeVersion: "v20.10.0"
      };
    }

    return {};
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error("Request failed");
  }
  return response.json();
}

async function loadCoreData() {
  let data;
  let isSample = false;

  try {
    const [summary, files, types, largest, buckets, scans] = await Promise.all([
      fetchJson(`${API_BASE}/summary`),
      fetchJson(`${API_BASE}/files?limit=10&offset=0`),
      fetchJson(`${API_BASE}/file-types`),
      fetchJson(`${API_BASE}/largest`),
      fetchJson(`${API_BASE}/size-buckets`),
      fetchJson(`${API_BASE}/recent-scans`)
    ]);

    data = {
      summary,
      files: files.items || [],
      fileTypes: types.items || [],
      largest: largest.items || [],
      sizeBuckets: buckets.items || [],
      scans: scans.items || []
    };
  } catch (error) {
    if (state.settings.sampleFallback) {
      data = { ...sampleData };
      isSample = true;
    } else {
      data = {
        summary: {
          totalFiles: 0,
          totalFolders: 0,
          totalSizeBytes: 0,
          oldestFileDate: null,
          oldestFilePath: null
        },
        files: [],
        fileTypes: [],
        largest: [],
        sizeBuckets: [],
        scans: []
      };
    }
  }

  updateAllViews(data, isSample);
  updateLiveStatusFromWatch();

  if (state.activeView === "aging") {
    await loadAgingAnalysis();
  }

  if (state.activeView === "directories") {
    await loadDirectorySummary();
  }
}

function updateAllViews(data, isSample) {
  state.summary = data.summary || {};
  state.files = data.files || [];
  state.fileTypes = data.fileTypes || [];
  state.sizeBuckets = data.sizeBuckets || [];
  state.largest = data.largest || [];
  state.scans = data.scans || [];

  updateSummaryCards(state.summary);
  updateScanSummary(state.summary);
  updateStatsView(state.summary);

  renderFileRows("fileRows", state.files);
  renderLargestList("largestFiles", state.largest);
  renderLargestList("largestFilesDetail", state.largest);

  renderScanRing("scanRing", "scanCount", state.scans.length);
  renderScanList("recentScans", state.scans);
  renderScanHistory(state.scans);

  renderTypeChart("typeChart", "typeLegend", state.fileTypes, "typeMain");
  renderTypeChart("typeChartDetail", "typeLegendDetail", state.fileTypes, "typeDetail");
  renderSizeChart("sizeChart", state.sizeBuckets, "sizeMain");
  renderSizeChart("sizeChartDetail", state.sizeBuckets, "sizeDetail");

  renderBucketList("sizeBucketList", state.sizeBuckets);
  loadSystemInfo();
  updateAllFilesCount(state.allFiles.length);
  updateSystemStatusCard();

  document.body.classList.toggle("sample-mode", isSample);
}

function updateSummaryCards(summary) {
  setText("totalFiles", formatNumber(summary.totalFiles));
  setText("totalFolders", formatNumber(summary.totalFolders));
  setText("totalSize", formatBytes(summary.totalSizeBytes));
  setText("oldestFileDate", formatDate(summary.oldestFileDate));

  const pathEl = document.getElementById("oldestFilePath");
  if (pathEl) {
    pathEl.textContent = summary.oldestFilePath || "No scan yet";
  }
}

function updateScanSummary(summary) {
  setText("scanTotalFiles", formatNumber(summary.totalFiles));
  setText("scanTotalFolders", formatNumber(summary.totalFolders));
  setText("scanTotalSize", formatBytes(summary.totalSizeBytes));
  setText("scanOldestFile", formatDate(summary.oldestFileDate));
}

function updateStatsView(summary) {
  setText("statTotalFiles", formatNumber(summary.totalFiles));
  setText("statTotalFolders", formatNumber(summary.totalFolders));
  setText("statTotalSize", formatBytes(summary.totalSizeBytes));
  setText("statOldestFile", formatDate(summary.oldestFileDate));

  const totalFiles = Number(summary.totalFiles || 0);
  const totalFolders = Number(summary.totalFolders || 0);
  const totalSize = Number(summary.totalSizeBytes || 0);
  const avgSize = totalFiles ? totalSize / totalFiles : 0;
  const ratio = totalFolders ? (totalFiles / totalFolders).toFixed(1) : "0";

  setText("statAvgSize", formatBytes(avgSize));
  setText("statFileRatio", ratio);
  setText("statLastScan", state.scans.length ? formatDate(state.scans[0].startedAt) : "N/A");
  setText("statLargestCount", formatNumber(state.largest.length));
}

function fileTypeClass(type) {
  const key = (type || "").toLowerCase();
  if (key.includes("doc")) return "file-doc";
  if (key.includes("image")) return "file-img";
  if (key.includes("video")) return "file-vid";
  if (key.includes("archive")) return "file-arc";
  if (key.includes("audio")) return "file-aud";
  if (key.includes("code")) return "file-code";
  return "file-other";
}

function renderFileRows(targetId, files) {
  const tbody = document.getElementById(targetId);
  if (!tbody) {
    return;
  }

  tbody.innerHTML = "";

  if (!files.length) {
    tbody.innerHTML = "<tr><td colspan=\"8\" class=\"empty-state\">No files scanned yet</td></tr>";
    return;
  }

  files.forEach((file) => {
    const row = document.createElement("tr");
    const typeLabel = file.type || (file.ext ? file.ext.replace(".", "").toUpperCase() : "FILE");

    row.innerHTML = `
      <td class="file-name">
        <span class="file-dot ${fileTypeClass(file.type)}"></span>
        ${file.name || "-"}
      </td>
      <td>${typeLabel}</td>
      <td>${formatBytes(file.sizeBytes)}</td>
      <td>${formatDate(file.createdAt)}</td>
      <td>${formatDate(file.modifiedAt)}</td>
      <td>${file.owner || "Unknown"}</td>
      <td>${file.permissions || "-"}</td>
      <td title="${file.path || ""}">${shortenPath(file.path)}</td>
    `;

    tbody.appendChild(row);
  });
}

function renderLargestList(targetId, items) {
  const container = document.getElementById(targetId);
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = "<div class=\"empty-state\">No data yet</div>";
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "largest-item";
    row.innerHTML = `
      <div class="largest-name">${item.name || "-"}</div>
      <div class="largest-size">${formatBytes(item.sizeBytes)}</div>
    `;
    container.appendChild(row);
  });
}

function renderScanRing(ringId, countId, count) {
  const ring = document.getElementById(ringId);
  const countEl = document.getElementById(countId);
  if (!ring || !countEl) {
    return;
  }

  countEl.textContent = count;
  const percent = Math.min((count / 8) * 100, 100);
  ring.style.setProperty("--scan-value", percent);
}

function renderScanList(targetId, items) {
  const list = document.getElementById(targetId);
  if (!list) {
    return;
  }

  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = "<div class=\"empty-state\">No scans yet</div>";
    return;
  }

  items.forEach((scan) => {
    const row = document.createElement("div");
    row.className = "scan-item";
    row.innerHTML = `
      <div>Scan ${scan.id}</div>
      <div class="scan-path">${scan.rootPath || "-"}</div>
      <div class="scan-path">${formatDate(scan.startedAt)} | ${formatNumber(scan.totalFiles)} files</div>
    `;
    list.appendChild(row);
  });
}

function renderScanHistory(items) {
  const list = document.getElementById("scanHistory");
  if (!list) {
    return;
  }

  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = "<div class=\"empty-state\">No scans yet</div>";
    return;
  }

  items.forEach((scan) => {
    const row = document.createElement("div");
    row.className = "scan-history-item";
    row.innerHTML = `
      <div>
        <div>Scan ${scan.id} - ${scan.rootPath || "-"}</div>
        <div class="scan-history-meta">Started ${formatDate(scan.startedAt)} | Completed ${formatDate(scan.completedAt)}</div>
      </div>
      <div class="scan-history-count">${formatNumber(scan.totalFiles)} files</div>
    `;
    list.appendChild(row);
  });
}

function renderTypeChart(canvasId, legendId, fileTypes, chartKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) {
    return;
  }

  const labels = fileTypes.map((item) => item.type);
  const values = fileTypes.map((item) => item.count);
  const colors = [
    "#4f8cff",
    "#f472b6",
    "#f59e0b",
    "#8b5cf6",
    "#1dd7ff",
    "#24d1a4",
    "#94a3b8"
  ];

  if (state.charts[chartKey]) {
    state.charts[chartKey].data.labels = labels;
    state.charts[chartKey].data.datasets[0].data = values;
    state.charts[chartKey].update();
  } else {
    state.charts[chartKey] = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        cutout: "70%",
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  if (legendId) {
    const legend = document.getElementById(legendId);
    if (legend) {
      legend.innerHTML = "";
      fileTypes.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "legend-item";
        row.innerHTML = `
          <span class="legend-dot" style="background:${colors[index % colors.length]}"></span>
          <span>${item.type}</span>
          <span>${formatNumber(item.count)}</span>
        `;
        legend.appendChild(row);
      });
    }
  }
}

function destroyAllCharts() {
  try {
    Object.keys(state.charts || {}).forEach((key) => {
      const c = state.charts[key];
      if (c && typeof c.destroy === "function") {
        try { c.destroy(); } catch (e) { /* ignore */ }
      }
      delete state.charts[key];
    });
    state.charts = {};
  } catch (e) {
    // ignore
  }
}

function renderSizeChart(canvasId, sizeBuckets, chartKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) {
    return;
  }

  const labels = sizeBuckets.map((item) => item.label);
  const values = sizeBuckets.map((item) => item.count);

  if (state.charts[chartKey]) {
    state.charts[chartKey].data.labels = labels;
    state.charts[chartKey].data.datasets[0].data = values;
    state.charts[chartKey].update();
  } else {
    state.charts[chartKey] = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Files",
            data: values,
            backgroundColor: "rgba(79, 140, 255, 0.6)",
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9ba6c5" }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#9ba6c5" }
          }
        }
      }
    });
  }
}

function renderBucketList(targetId, buckets) {
  const container = document.getElementById(targetId);
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!buckets.length) {
    container.innerHTML = "<div class=\"empty-state\">No data yet</div>";
    return;
  }

  buckets.forEach((bucket) => {
    const row = document.createElement("div");
    row.className = "bucket-item";
    row.innerHTML = `
      <div class="bucket-label">${bucket.label}</div>
      <div class="bucket-count">${formatNumber(bucket.count)}</div>
    `;
    container.appendChild(row);
  });
}

function getIntInputValue(id, fallback, min, max) {
  const rawValue = document.getElementById(id)?.value;
  const parsedValue = Number.parseInt(rawValue || String(fallback), 10);
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : fallback;
  return Math.min(Math.max(safeValue, min), max);
}

function renderAgingRows(items) {
  const tbody = document.getElementById("agingRows");
  if (!tbody) {
    return;
  }

  tbody.innerHTML = "";

  if (!items.length) {
    tbody.innerHTML = "<tr><td colspan=\"5\" class=\"empty-state\">No aging data yet</td></tr>";
    return;
  }

  items.forEach((file) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="file-name">
        <span class="file-dot ${fileTypeClass(file.type)}"></span>
        ${file.name || "-"}
      </td>
      <td>${formatDate(file.modifiedAt)}</td>
      <td>${formatBytes(file.sizeBytes)}</td>
      <td>${file.owner || "Unknown"}</td>
      <td title="${file.path || ""}">${shortenPath(file.path)}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderDirectorySummaryRows(items) {
  const tbody = document.getElementById("dirSummaryRows");
  if (!tbody) {
    return;
  }

  tbody.innerHTML = "";

  if (!items.length) {
    tbody.innerHTML = "<tr><td colspan=\"3\" class=\"empty-state\">No directory summary yet</td></tr>";
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.path || "-"}</td>
      <td>${formatNumber(item.totalFiles)}</td>
      <td>${formatBytes(item.totalSizeBytes)}</td>
    `;
    tbody.appendChild(row);
  });
}

async function loadAgingAnalysis() {
  const days = getIntInputValue("agingDays", 90, 1, 5000);
  const limit = getIntInputValue("agingLimit", 100, 1, 500);
  const countEl = document.getElementById("agingCount");
  const cutoffEl = document.getElementById("agingCutoff");
  const rows = document.getElementById("agingRows");

  if (rows) {
    rows.innerHTML = "<tr><td colspan=\"5\" class=\"empty-state\">Loading aging data...</td></tr>";
  }

  try {
    const result = await fetchJson(`${API_BASE}/aging?days=${days}&limit=${limit}`);
    const items = result.items || [];
    renderAgingRows(items);

    if (countEl) {
      countEl.textContent = `Showing ${formatNumber(items.length)} files older than ${days} days`;
    }

    if (cutoffEl) {
      cutoffEl.textContent = result.cutoff ? `Cutoff: ${formatDate(result.cutoff)}` : "Ready";
    }
  } catch (error) {
    if (state.settings.sampleFallback) {
      renderAgingRows(sampleData.aging || []);
      if (countEl) {
        countEl.textContent = `Showing ${formatNumber((sampleData.aging || []).length)} sample files`;
      }
      if (cutoffEl) {
        cutoffEl.textContent = "Cutoff: sample data";
      }
    } else {
      renderAgingRows([]);
      if (countEl) {
        countEl.textContent = "Showing 0 files";
      }
      if (cutoffEl) {
        cutoffEl.textContent = "Unavailable";
      }
    }
  }
}

async function loadDirectorySummary() {
  const depth = getIntInputValue("dirSummaryDepth", 2, 1, 10);
  const limit = getIntInputValue("dirSummaryLimit", 20, 1, 200);
  const countEl = document.getElementById("dirSummaryCount");
  const rows = document.getElementById("dirSummaryRows");

  if (rows) {
    rows.innerHTML = "<tr><td colspan=\"3\" class=\"empty-state\">Loading directory summary...</td></tr>";
  }

  try {
    const result = await fetchJson(`${API_BASE}/dir-summary?depth=${depth}&limit=${limit}`);
    const items = result.items || [];
    renderDirectorySummaryRows(items);

    if (countEl) {
      countEl.textContent = `Showing ${formatNumber(items.length)} folders at depth ${depth}`;
    }
  } catch (error) {
    if (state.settings.sampleFallback) {
      renderDirectorySummaryRows(sampleData.dirSummary || []);
      if (countEl) {
        countEl.textContent = `Showing ${formatNumber((sampleData.dirSummary || []).length)} sample folders`;
      }
    } else {
      renderDirectorySummaryRows([]);
      if (countEl) {
        countEl.textContent = "Showing 0 folders";
      }
    }
  }
}

async function loadSystemInfo() {
  try {
    const systemData = await fetchJson(`${API_BASE}/system-info`);
    renderSystemInfo(systemData);
  } catch (error) {
    console.error("Failed to load system info:", error);
    renderSystemInfoFallback();
  }
}

function renderSystemInfo(data) {
  const container = document.getElementById("systemInfo");
  if (!container) {
    return;
  }

  const info = [
    { label: "Operating System", value: data.os || "Unknown" },
    { label: "OS Release", value: data.release || "Unknown" },
    { label: "Architecture", value: data.arch || "Unknown" },
    { label: "CPU Model", value: data.cpuModel || "Unknown" },
    { label: "CPU Cores", value: data.cpuCount || "Unknown" },
    { label: "Total Memory", value: `${data.totalMemory} GB` || "Unknown" },
    { label: "Free Memory", value: `${data.freeMemory} GB` || "Unknown" },
    { label: "Used Memory", value: `${data.usedMemory} GB` || "Unknown" },
    { label: "System Uptime", value: `${Math.floor(data.uptime / 3600)} hours` || "Unknown" },
    { label: "Hostname", value: data.hostname || "Unknown" },
    { label: "Username", value: data.username || "Unknown" },
    { label: "Node.js Version", value: data.nodeVersion || "Unknown" },
    { label: "Timezone", value: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown" },
    { label: "Local Time", value: new Date().toLocaleString(), id: "localTimeValue" }
  ];

  container.innerHTML = "";

  info.forEach((item) => {
    const row = document.createElement("div");
    row.className = "system-item";
    const valueId = item.id ? ` id="${item.id}"` : "";
    row.innerHTML = `
      <div class="system-label">${item.label}</div>
      <div class="system-value"${valueId}>${item.value}</div>
    `;
    container.appendChild(row);
  });

  startTimeUpdater();

  // Update user display in header and user-chip to reflect system owner
  try {
    const ownerName = data.username || data.user || "Unknown";
    const userNameEl = document.querySelector(".user-name");
    if (userNameEl) {
      userNameEl.textContent = ownerName;
    }

    const welcomeEl = document.querySelector(".welcome h1");
    if (welcomeEl) {
      welcomeEl.textContent = `Welcome back, ${ownerName}`;
    }
  } catch (e) {
    // ignore silent failures
  }
}

function renderSystemInfoFallback() {
  const container = document.getElementById("systemInfo");
  if (!container) {
    return;
  }

  const info = [
    { label: "Platform", value: navigator.platform || "Unknown" },
    { label: "User Agent", value: navigator.userAgent || "Unknown" },
    { label: "Language", value: navigator.language || "Unknown" },
    { label: "Time Zone", value: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown" },
    { label: "Local Time", value: new Date().toLocaleString(), id: "localTimeValue" },
    { label: "Screen", value: `${window.screen.width} x ${window.screen.height}` }
  ];

  container.innerHTML = "";

  info.forEach((item) => {
    const row = document.createElement("div");
    row.className = "system-item";
    const valueId = item.id ? ` id="${item.id}"` : "";
    row.innerHTML = `
      <div class="system-label">${item.label}</div>
      <div class="system-value"${valueId}>${item.value}</div>
    `;
    container.appendChild(row);
  });

  startTimeUpdater();
}


async function loadDuplicates() {
  const container = document.getElementById("duplicateGroups");
  if (!container) {
    return;
  }

  container.innerHTML = "<div class=\"empty-state\">Loading duplicates...</div>";

  try {
    const result = await fetchJson(`${API_BASE}/duplicates`);
    renderDuplicates(result.items || []);
  } catch (error) {
    container.innerHTML = "<div class=\"empty-state\">Unable to load duplicates</div>";
  }
}

function renderDuplicates(items) {
  const container = document.getElementById("duplicateGroups");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = "<div class=\"empty-state\">No duplicates found</div>";
    return;
  }

  items.forEach((group) => {
    const card = document.createElement("div");
    card.className = "duplicate-group";

    const filesHtml = (group.files || []).map((file) => {
      return `
        <div class="duplicate-file">
          <div class="duplicate-name">${file.name || "-"}</div>
          <div>${formatBytes(file.sizeBytes)} | ${formatDate(file.modifiedAt)}</div>
        </div>
      `;
    }).join("");

    card.innerHTML = `
      <div class="duplicate-header">
        <div>
          <div>Hash Group</div>
          <div class="duplicate-hash">${group.hash}</div>
        </div>
        <div class="duplicate-count">${formatNumber(group.count)} files</div>
      </div>
      <div class="duplicate-files">${filesHtml}</div>
    `;

    container.appendChild(card);
  });
}

async function runAdvancedSearch(reset = false) {
  if (reset) {
    state.searchOffset = 0;
  }

  const params = new URLSearchParams();
  const name = document.getElementById("searchName")?.value.trim();
  const owner = document.getElementById("searchOwner")?.value.trim();
  const type = document.getElementById("searchType")?.value;
  const minSize = document.getElementById("searchMinSize")?.value;
  const maxSize = document.getElementById("searchMaxSize")?.value;
  const fromDateRaw = document.getElementById("searchFromDate")?.value;
  const toDateRaw = document.getElementById("searchToDate")?.value;
  const sortBy = document.getElementById("searchSortBy")?.value;
  const sortDir = document.getElementById("searchSortDir")?.value;

  if (name) params.append("name", name);
  if (owner) params.append("owner", owner);
  if (type) params.append("type", type);
  if (minSize) params.append("minSize", minSize);
  if (maxSize) params.append("maxSize", maxSize);
  if (fromDateRaw) {
    params.append("fromDate", new Date(fromDateRaw).toISOString());
  }
  if (toDateRaw) {
    const end = new Date(toDateRaw);
    end.setHours(23, 59, 59, 999);
    params.append("toDate", end.toISOString());
  }
  if (sortBy) params.append("sortBy", sortBy);
  if (sortDir) params.append("sortDir", sortDir);

  params.append("limit", String(state.searchLimit));
  params.append("offset", String(state.searchOffset));

  try {
    const result = await fetchJson(`${API_BASE}/search?${params.toString()}`);
    state.searchResults = result.items || [];
    renderSearchResults();
  } catch (error) {
    state.searchResults = [];
    renderSearchResults();
  }
}

function renderSearchResults() {
  renderFileRows("searchRows", state.searchResults);
  updateSearchCount(state.searchResults.length);
}

function updateSearchCount(currentCount) {
  const totalFiles = Number(state.summary.totalFiles || 0);
  const start = totalFiles ? state.searchOffset + 1 : 0;
  const end = totalFiles ? Math.min(state.searchOffset + currentCount, totalFiles) : currentCount;
  const label = totalFiles
    ? `Showing ${formatNumber(start)} - ${formatNumber(end)} of ${formatNumber(totalFiles)} files`
    : `Showing ${formatNumber(currentCount)} files`;

  setText("searchCount", label);

  const page = totalFiles ? Math.floor(state.searchOffset / state.searchLimit) + 1 : 1;
  const totalPages = totalFiles ? Math.ceil(totalFiles / state.searchLimit) : 1;
  setText("searchPageInfo", `Page ${page} of ${totalPages}`);

  const prev = document.getElementById("searchPrev");
  const next = document.getElementById("searchNext");

  if (prev) {
    prev.disabled = state.searchOffset <= 0;
  }

  if (next) {
    next.disabled = totalFiles ? state.searchOffset + state.searchLimit >= totalFiles : currentCount < state.searchLimit;
  }
}

async function loadAllFiles(reset = false) {
  if (reset) {
    state.allOffset = 0;
  }

  try {
    const result = await fetchJson(`${API_BASE}/files?limit=${state.allLimit}&offset=${state.allOffset}`);
    state.allFiles = result.items || [];
  } catch (error) {
    if (state.settings.sampleFallback) {
      state.allFiles = sampleData.files;
    } else {
      state.allFiles = [];
    }
  }

  renderAllFiles();
}

function renderAllFiles() {
  const filtered = applyAllFilesFilters(state.allFiles);
  renderFileRows("allFileRows", filtered);
  updateAllFilesCount(filtered.length);
}

function applyAllFilesFilters(files) {
  const query = (document.getElementById("allSearch")?.value || "").toLowerCase().trim();
  const type = (document.getElementById("typeFilter")?.value || "").toLowerCase();
  const owner = (document.getElementById("ownerFilter")?.value || "").toLowerCase().trim();

  return files.filter((file) => {
    const haystack = [
      file.name,
      file.path,
      file.owner,
      file.type
    ].join(" ").toLowerCase();

    if (query && !haystack.includes(query)) {
      return false;
    }

    if (type && (file.type || "").toLowerCase() !== type) {
      return false;
    }

    if (owner && !(file.owner || "").toLowerCase().includes(owner)) {
      return false;
    }

    return true;
  });
}

function updateAllFilesCount(currentCount) {
  const totalFiles = Number(state.summary.totalFiles || 0);
  const start = totalFiles ? state.allOffset + 1 : 0;
  const end = totalFiles ? Math.min(state.allOffset + currentCount, totalFiles) : currentCount;

  const countLabel = totalFiles
    ? `Showing ${formatNumber(start)} - ${formatNumber(end)} of ${formatNumber(totalFiles)} files`
    : `Showing ${formatNumber(currentCount)} files`;

  setText("allFilesCount", countLabel);

  const page = totalFiles ? Math.floor(state.allOffset / state.allLimit) + 1 : 1;
  const totalPages = totalFiles ? Math.ceil(totalFiles / state.allLimit) : 1;
  setText("pageInfo", `Page ${page} of ${totalPages}`);

  const prevButton = document.getElementById("prevPage");
  const nextButton = document.getElementById("nextPage");

  if (prevButton) {
    prevButton.disabled = state.allOffset <= 0;
  }

  if (nextButton) {
    nextButton.disabled = totalFiles ? state.allOffset + state.allLimit >= totalFiles : currentCount < state.allLimit;
  }
}

function setScanStatus(message, tone) {
  const status = document.getElementById("scanStatus");
  if (!status) {
    return;
  }

  status.classList.remove("success", "error");
  if (tone) {
    status.classList.add(tone);
  }
  status.textContent = message;
}

function setLiveStatus(status) {
  const badge = document.getElementById("liveStatus");
  if (!badge) {
    return;
  }

  badge.textContent = status;
  badge.classList.remove("idle", "scanning", "watching", "error");

  if (status === "Scanning") {
    badge.classList.add("scanning");
  } else if (status === "Watching") {
    badge.classList.add("watching");
  } else if (status === "Error") {
    badge.classList.add("error");
  } else {
    badge.classList.add("idle");
  }

  updateSystemStatusCard();
}

async function updateLiveStatusFromWatch() {
  if (state.scanActive) {
    setLiveStatus("Scanning");
    return;
  }

  try {
    const watch = await fetchJson(`${API_BASE}/watch`);
    state.watchActive = Boolean(watch.active);
    setLiveStatus(watch.active ? "Watching" : "Idle");
  } catch (error) {
    state.watchActive = false;
    setLiveStatus("Idle");
  }
}

function updateSystemStatusCard() {
  const stateEl = document.getElementById("systemStatusState");
  const scanEl = document.getElementById("systemStatusScan");

  if (!stateEl || !scanEl) {
    return;
  }

  let statusLabel = "Idle";
  if (state.scanActive) {
    statusLabel = "Scanning";
  } else if (state.watchActive) {
    statusLabel = "Monitoring";
  }

  stateEl.textContent = statusLabel;

  if (!state.scans.length) {
    scanEl.textContent = "No scans yet";
    return;
  }

  const latest = state.scans[0];
  const lastTime = latest.completedAt || latest.startedAt;
  scanEl.textContent = `Last scan ${timeAgo(lastTime)}`;
}

// Pause heavy activity when the page is not visible to reduce RAM/CPU usage
function handleVisibilityChange() {
  if (document.hidden) {
    // stop frequent timers
    if (state.autoRefreshTimer) {
      clearInterval(state.autoRefreshTimer);
      state._autoRefreshWasOn = true;
      state.autoRefreshTimer = null;
    } else {
      state._autoRefreshWasOn = false;
    }

    if (state.scanPollTimer) {
      clearInterval(state.scanPollTimer);
      state._scanPollWasOn = true;
      state.scanPollTimer = null;
    } else {
      state._scanPollWasOn = false;
    }

    stopTimeUpdater();
    destroyAllCharts();
  } else {
    // resume paused timers conservatively
    if (state._autoRefreshWasOn) {
      state.autoRefreshTimer = setInterval(() => loadCoreData(), 60000);
      state._autoRefreshWasOn = false;
    }

    if (state._scanPollWasOn) {
      // trigger one immediate poll then resume
      updateLiveStatusFromWatch();
      state.scanPollTimer = setInterval(() => updateLiveStatusFromWatch(), 15000);
      state._scanPollWasOn = false;
    }

    // refresh visible view data once
    loadCoreData();
  }
}

document.addEventListener("visibilitychange", handleVisibilityChange, false);

function timeAgo(value) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const seconds = Math.max(Math.floor(diffMs / 1000), 0);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function setScanProgress({ active, processed, path, done, failed }) {
  const bar = document.getElementById("scanProgressBar");
  const text = document.getElementById("scanProgressText");

  if (!bar || !text) {
    return;
  }

  if (failed) {
    bar.classList.remove("active");
    bar.style.width = "0%";
    text.textContent = "Scan failed.";
    return;
  }

  if (done) {
    bar.classList.remove("active");
    bar.style.width = "100%";
    text.textContent = "Scan complete.";
    return;
  }

  if (active) {
    bar.classList.add("active");
  }

  const processedLabel = processed ? `${formatNumber(processed)} items` : "Processing";
  const pathLabel = path ? ` | ${path}` : "";
  text.textContent = `${processedLabel}${pathLabel}`;
}

function setScanButtonsDisabled(isDisabled) {
  const ids = ["scanButton", "scanSubmit", "quickScan"];
  ids.forEach((id) => {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = isDisabled;
    }
  });
}

async function runScan(pathValue) {
  const path = (pathValue || "").trim();
  if (!path) {
    return;
  }

  setScanButtonsDisabled(true);
  setScanStatus("Scan queued...", null);
  setScanProgress({ active: true, processed: 0, path: null });
  state.scanActive = true;
  setLiveStatus("Scanning");

  try {
    const incremental = Boolean(document.getElementById("scanIncremental")?.checked);
    const response = await fetchJson(`${API_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, incremental })
    });
    state.currentJobId = response.jobId;
    connectWebSocket();
    await pollScanJob(response.jobId);
  } catch (error) {
    setScanStatus("Scan failed to start. Check the path and try again.", "error");
    if (state.settings.sampleFallback) {
      updateAllViews(sampleData, true);
    }
    setScanButtonsDisabled(false);
    setScanProgress({ failed: true });
    state.scanActive = false;
    setLiveStatus("Error");
  }
}

async function pollScanJob(jobId) {
  if (!jobId) {
    return;
  }

  if (state.scanPollTimer) {
    clearTimeout(state.scanPollTimer);
  }

  const poll = async () => {
    try {
      const job = await fetchJson(`${API_BASE}/status/${jobId}`);
      if (job.status === "completed") {
        setScanStatus("Scan completed successfully.", "success");
        setScanProgress({ done: true });
        await loadCoreData();
        await loadAllFiles(true);
        setScanButtonsDisabled(false);
        state.currentJobId = null;
        state.scanActive = false;
        await updateLiveStatusFromWatch();
        return;
      }

      if (job.status === "failed") {
        setScanStatus(job.error || "Scan failed.", "error");
        setScanProgress({ failed: true });
        setScanButtonsDisabled(false);
        state.currentJobId = null;
        state.scanActive = false;
        setLiveStatus("Error");
        return;
      }

      setScanStatus(`Scan ${job.status}...`, null);
      state.scanActive = true;
      setLiveStatus("Scanning");
      state.scanPollTimer = setTimeout(poll, 1000);
    } catch (error) {
      setScanStatus("Scan status unavailable.", "error");
      setScanProgress({ failed: true });
      setScanButtonsDisabled(false);
      state.currentJobId = null;
      state.scanActive = false;
      setLiveStatus("Error");
    }
  };

  await poll();
}

function connectWebSocket() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${window.location.host}`;
  const socket = new WebSocket(wsUrl);
  state.ws = socket;

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleWsMessage(payload);
    } catch (error) {
      // ignore
    }
  });
}

function handleWsMessage(payload) {
  if (!payload || !payload.type) {
    return;
  }

  const jobId = payload.jobId;
  if (state.currentJobId && jobId && jobId !== state.currentJobId) {
    return;
  }

  if (payload.type === "scan-started") {
    setScanStatus("Scan running...", null);
    setScanProgress({ active: true, processed: 0, path: payload.path });
    state.scanActive = true;
    setLiveStatus("Scanning");
    updateSystemStatusCard();
    return;
  }

  if (payload.type === "scan-progress") {
    setScanProgress({ active: true, processed: payload.processed, path: payload.path });
    state.scanActive = true;
    setLiveStatus("Scanning");
    updateSystemStatusCard();
    return;
  }

  if (payload.type === "scan-completed") {
    setScanStatus("Scan completed successfully.", "success");
    setScanProgress({ done: true });
    state.currentJobId = null;
    state.scanActive = false;
    updateLiveStatusFromWatch();
    updateSystemStatusCard();
    return;
  }

  if (payload.type === "scan-failed") {
    setScanStatus(payload.error || "Scan failed.", "error");
    setScanProgress({ failed: true });
    state.currentJobId = null;
    state.scanActive = false;
    setLiveStatus("Error");
    updateSystemStatusCard();
  }
}

function updateTimeDisplay() {
  const timeElement = document.getElementById("localTimeValue");
  if (timeElement) {
    timeElement.textContent = new Date().toLocaleString();
  }
}

function startTimeUpdater() {
  stopTimeUpdater();
  updateTimeDisplay();
  state.timeUpdateTimer = setInterval(updateTimeDisplay, 1000);
}

function stopTimeUpdater() {
  if (state.timeUpdateTimer) {
    clearInterval(state.timeUpdateTimer);
    state.timeUpdateTimer = null;
  }
}

function switchView(viewKey) {
  const prevView = state.activeView;
  state.activeView = viewKey;

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === viewKey);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewKey);
  });

  if (viewKey !== "system") {
    stopTimeUpdater();
  }

  // Unload charts when leaving dashboard/stats views to free memory
  try {
    const chartsViews = ["dashboard", "stats", "size", "type", "top"];
    if (prevView && prevView !== viewKey && !chartsViews.includes(viewKey)) {
      destroyAllCharts();
    }
  } catch (e) {
    // ignore
  }

  if (viewKey === "files") {
    loadAllFiles();
  }

  if (viewKey === "search") {
    runAdvancedSearch(true);
  }

  if (viewKey === "duplicates") {
    loadDuplicates();
  }

  if (viewKey === "aging") {
    loadAgingAnalysis();
  }

  if (viewKey === "directories") {
    loadDirectorySummary();
  }

  if (viewKey === "system") {
    loadSystemInfo();
  }

  if (viewKey === "settings") {
    syncSettingsUI();
  }
}

function setupNavigation() {
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.view);
    });
  });
}

function setupSearch() {
  const globalSearch = document.getElementById("globalSearch");
  const fileSearch = document.getElementById("fileSearch");

  if (fileSearch) {
    fileSearch.addEventListener("input", debounce((event) => {
      const term = event.target.value.toLowerCase().trim();
      const filtered = state.files.filter((file) => {
        const haystack = [file.name, file.path, file.owner, file.type].join(" ").toLowerCase();
        return haystack.includes(term);
      });
      renderFileRows("fileRows", term ? filtered : state.files);
    }, 200));
  }

  if (globalSearch) {
    globalSearch.addEventListener("input", debounce(async (event) => {
      const term = event.target.value.trim();
      if (!term) {
        const allSearch = document.getElementById("allSearch");
        if (allSearch) { allSearch.value = ""; }
        if (state.activeView === "files") { renderAllFiles(); }
        return;
      }

      const allSearch = document.getElementById("allSearch");
      if (allSearch) { allSearch.value = term; }

      switchView("files");
      if (!state.allFiles.length) { await loadAllFiles(true); }
      renderAllFiles();
    }, 300));
  }
}

function setupFilters() {
  const filtersButton = document.getElementById("filtersButton");
  const filterPanel = document.getElementById("allFilters");
  const allSearch = document.getElementById("allSearch");
  const typeFilter = document.getElementById("typeFilter");
  const ownerFilter = document.getElementById("ownerFilter");
  const clearFilters = document.getElementById("clearFilters");

  if (filtersButton && filterPanel) {
    filtersButton.addEventListener("click", () => {
      switchView("files");
      filterPanel.classList.toggle("is-open");
    });
  }

  [allSearch, typeFilter, ownerFilter].forEach((input) => {
    if (input) {
      input.addEventListener("input", debounce(renderAllFiles, 200));
      input.addEventListener("change", debounce(renderAllFiles, 200));
    }
  });

  if (clearFilters) {
    clearFilters.addEventListener("click", () => {
      if (allSearch) allSearch.value = "";
      if (typeFilter) typeFilter.value = "";
      if (ownerFilter) ownerFilter.value = "";
      renderAllFiles();
    });
  }
}

function setupAdvancedSearch() {
  const applyButton = document.getElementById("searchApply");
  const clearButton = document.getElementById("searchClear");
  const prevButton = document.getElementById("searchPrev");
  const nextButton = document.getElementById("searchNext");

  if (applyButton) {
    applyButton.addEventListener("click", async () => {
      await runAdvancedSearch(true);
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", async () => {
      [
        "searchName",
        "searchOwner",
        "searchType",
        "searchMinSize",
        "searchMaxSize",
        "searchFromDate",
        "searchToDate",
        "searchSortBy",
        "searchSortDir"
      ].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
          if (input.tagName === "SELECT") {
            input.value = input.querySelector("option")?.value || "";
          } else {
            input.value = "";
          }
        }
      });

      await runAdvancedSearch(true);
    });
  }

  if (prevButton) {
    prevButton.addEventListener("click", async () => {
      if (state.searchOffset <= 0) {
        return;
      }
      state.searchOffset = Math.max(state.searchOffset - state.searchLimit, 0);
      await runAdvancedSearch();
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", async () => {
      state.searchOffset += state.searchLimit;
      await runAdvancedSearch();
    });
  }
}

function setupDuplicates() {
  const refreshButton = document.getElementById("refreshDuplicates");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadDuplicates);
  }
}

function setupAnalysisViews() {
  const agingApply = document.getElementById("agingApply");
  const refreshAging = document.getElementById("refreshAging");
  const dirSummaryApply = document.getElementById("dirSummaryApply");
  const refreshDirectories = document.getElementById("refreshDirectories");

  if (agingApply) {
    agingApply.addEventListener("click", loadAgingAnalysis);
  }

  if (refreshAging) {
    refreshAging.addEventListener("click", loadAgingAnalysis);
  }

  if (dirSummaryApply) {
    dirSummaryApply.addEventListener("click", loadDirectorySummary);
  }

  if (refreshDirectories) {
    refreshDirectories.addEventListener("click", loadDirectorySummary);
  }
}

function setupPagination() {
  const prev = document.getElementById("prevPage");
  const next = document.getElementById("nextPage");

  if (prev) {
    prev.addEventListener("click", async () => {
      if (state.allOffset <= 0) {
        return;
      }
      state.allOffset = Math.max(state.allOffset - state.allLimit, 0);
      await loadAllFiles();
    });
  }

  if (next) {
    next.addEventListener("click", async () => {
      const total = Number(state.summary.totalFiles || 0);
      if (total && state.allOffset + state.allLimit >= total) {
        return;
      }
      state.allOffset += state.allLimit;
      await loadAllFiles();
    });
  }
}

function setupScanControls() {
  const scanButton = document.getElementById("scanButton");
  const quickScan = document.getElementById("quickScan");
  const scanSubmit = document.getElementById("scanSubmit");

  if (scanButton) {
    scanButton.addEventListener("click", async () => {
      const path = window.prompt("Enter a full directory path to scan");
      if (path) {
        await runScan(path);
      }
    });
  }

  if (quickScan) {
    quickScan.addEventListener("click", async () => {
      const path = window.prompt("Enter a full directory path to scan");
      if (path) {
        await runScan(path);
      }
    });
  }

  if (scanSubmit) {
    scanSubmit.addEventListener("click", async () => {
      const input = document.getElementById("scanPathInput");
      await runScan(input ? input.value : "");
    });
  }
}

function setupTopbar() {
  const refreshButton = document.getElementById("refreshButton");

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      await loadCoreData();
      if (state.activeView === "files") {
        await loadAllFiles();
      }
      updateLiveStatusFromWatch();
    });
  }
}

function setupQuickActions() {
  const exportBtn = document.getElementById("quickExport");
  const cleanBtn = document.getElementById("quickClean");
  const settingsBtn = document.getElementById("quickSettings");
  const exportTopBtn = document.getElementById("exportButton");

  if (exportBtn) {
    exportBtn.addEventListener("click", exportCsvReport);
  }

  if (exportTopBtn) {
    exportTopBtn.addEventListener("click", exportCsvReport);
  }

  if (cleanBtn) {
    cleanBtn.addEventListener("click", cleanDatabase);
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => switchView("settings"));
  }
}

async function exportCsvReport() {
  if (typeof isDemoMode === "function" && isDemoMode()) {
    const header = ["Name", "Type", "SizeBytes", "CreatedAt", "ModifiedAt", "Owner", "Path"];
    const lines = [header.join(",")];
    
    sampleData.files.forEach((f) => {
      const vals = [f.name, f.type, f.sizeBytes, f.createdAt, f.modifiedAt, f.owner, f.path];
      lines.push(vals.map((v) => `"${(v || "").toString().replace(/"/g, '""')}"`).join(","));
    });
    
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `file-metadata-demo-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  
  window.open(`${API_BASE}/export?format=csv`, "_blank");
}

async function cleanDatabase() {
  const confirmed = window.confirm("This will delete all stored scan data. Continue?");
  if (!confirmed) {
    return;
  }

  if (typeof isDemoMode === "function" && isDemoMode()) {
    setScanStatus("Database cannot be cleared in Demo Mode.", "error");
    return;
  }

  try {
    await fetchJson(`${API_BASE}/reset`, { method: "DELETE" });
    await loadCoreData();
    await loadAllFiles(true);
    setScanStatus("Database cleared.", "success");
  } catch (error) {
    setScanStatus("Unable to clear database.", "error");
  }
}

function setupSettings() {
  const autoRefresh = document.getElementById("settingAutoRefresh");
  const compact = document.getElementById("settingCompactTable");
  const sampleFallback = document.getElementById("settingSampleFallback");

  if (autoRefresh) {
    autoRefresh.addEventListener("change", () => {
      state.settings.autoRefresh = autoRefresh.checked;
      saveSettings();
      applySettings();
    });
  }

  if (compact) {
    compact.addEventListener("change", () => {
      state.settings.compactTable = compact.checked;
      saveSettings();
      applySettings();
    });
  }

  if (sampleFallback) {
    sampleFallback.addEventListener("change", () => {
      state.settings.sampleFallback = sampleFallback.checked;
      saveSettings();
      applySettings();
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  applySettings();
  setupNavigation();
  setupSearch();
  setupFilters();
  setupAdvancedSearch();
  setupDuplicates();
  setupAnalysisViews();
  setupPagination();
  setupScanControls();
  setupTopbar();
  setupQuickActions();
  setupSettings();

  const initialView = new URLSearchParams(window.location.search).get("view") || window.location.hash.replace(/^#/, "");
  if (initialView) {
    switchView(initialView);
  }

  loadCoreData();
  updateLiveStatusFromWatch();
});
