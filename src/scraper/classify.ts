export type PageKind = "content" | "listing" | "image" | "document" | "asset";

export const PAGE_KINDS: readonly PageKind[] = ["content", "listing", "image", "document", "asset"];

export function isPageKind(value: unknown): value is PageKind {
  return typeof value === "string" && (PAGE_KINDS as string[]).includes(value);
}

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "avif",
  "ico",
  "bmp",
  "tif",
  "tiff",
]);

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "rtf",
  "epub",
]);

const ASSET_EXTENSIONS = new Set([
  "css",
  "js",
  "mjs",
  "json",
  "xml",
  "zip",
  "tar",
  "gz",
  "rar",
  "7z",
  "mp3",
  "mp4",
  "webm",
  "avi",
  "mov",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "wasm",
]);

const LISTING_SEGMENTS = new Set([
  "tag",
  "tags",
  "category",
  "categories",
  "author",
  "archive",
  "archives",
  "feed",
  "rss",
  "wp-json",
]);

/**
 * Classifies a URL by shape alone (no network requests): binary assets by
 * extension, junk HTML (pagination, tag/category/author archives, feeds,
 * residual query strings) as "listing", everything else as "content".
 * Assumes the URL was already canonicalized (tracking params stripped).
 */
export function classifyUrl(url: string): PageKind {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "content";
  }

  const path = parsed.pathname.toLowerCase();
  const lastSegment = path.split("/").filter(Boolean).pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex > 0) {
    const ext = lastSegment.slice(dotIndex + 1);
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
    if (ASSET_EXTENSIONS.has(ext)) return "asset";
  }

  const segments = path.split("/").filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (LISTING_SEGMENTS.has(segment)) return "listing";
    if (segment === "page" && /^\d+$/.test(segments[i + 1] ?? "")) return "listing";
  }

  // Date archives: path is exactly /YYYY or /YYYY/MM.
  if (/^\/\d{4}(\/\d{1,2})?$/.test(path)) return "listing";

  // Tracking params are stripped during canonicalization, so any leftover
  // query (?page=, ?sort=, ?filter=, ...) marks a parameterized view.
  if (parsed.search) return "listing";

  return "content";
}
