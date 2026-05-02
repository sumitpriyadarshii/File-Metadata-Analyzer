const documentExts = new Set([
  ".doc",
  ".docx",
  ".pdf",
  ".txt",
  ".rtf",
  ".odt",
  ".xls",
  ".xlsx",
  ".csv",
  ".ppt",
  ".pptx"
]);

const imageExts = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".tiff"
]);

const videoExts = new Set([
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".wmv",
  ".flv",
  ".webm"
]);

const audioExts = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".ogg",
  ".m4a"
]);

const archiveExts = new Set([
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".bz2"
]);

const codeExts = new Set([
  ".js",
  ".ts",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".cs",
  ".go",
  ".rb",
  ".php",
  ".html",
  ".css",
  ".json",
  ".yml",
  ".yaml",
  ".md"
]);

export function classifyExt(ext) {
  if (!ext) {
    return "Other";
  }

  const lower = ext.toLowerCase();

  if (documentExts.has(lower)) {
    return "Documents";
  }

  if (imageExts.has(lower)) {
    return "Images";
  }

  if (videoExts.has(lower)) {
    return "Videos";
  }

  if (audioExts.has(lower)) {
    return "Audio";
  }

  if (archiveExts.has(lower)) {
    return "Archives";
  }

  if (codeExts.has(lower)) {
    return "Code";
  }

  return "Other";
}
