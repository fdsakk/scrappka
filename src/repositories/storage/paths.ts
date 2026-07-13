import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function scrapedRoot(): string {
  return resolve(process.env.SCRAPED_DIR ?? "./scraped_data");
}

export function resolveJobPath(jobId: string, filename = ""): string {
  const root = scrapedRoot();
  const jobRoot = resolve(root, jobId);
  if (jobRoot !== root && !jobRoot.startsWith(`${root}/`)) {
    throw new Error("Invalid job path");
  }
  const path = resolve(jobRoot, filename);
  if (path !== jobRoot && !path.startsWith(`${jobRoot}/`)) throw new Error("Invalid job path");
  return path;
}

export function resolvePagePath(jobId: string, slug: string, filename = ""): string {
  if (!isSafeSlug(slug)) throw new Error("Invalid page slug");
  const root = scrapedRoot();
  const pageRoot = resolve(root, jobId, "pages", slug);
  if (!pageRoot.startsWith(`${root}/`)) throw new Error("Invalid page path");
  const path = resolve(pageRoot, filename);
  if (path !== pageRoot && !path.startsWith(`${pageRoot}/`)) throw new Error("Invalid page path");
  return path;
}

export async function writeJobFile(jobId: string, filename: string, content: string): Promise<string> {
  const path = resolveJobPath(jobId, filename);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, content);
  return path;
}

export async function readJobFile(jobId: string, filename: string): Promise<string> {
  return await Bun.file(resolveJobPath(jobId, filename)).text();
}

export async function writePageFile(
  jobId: string,
  slug: string,
  filename: string,
  content: string,
): Promise<string> {
  const path = resolvePagePath(jobId, slug, filename);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, content);
  return path;
}

export async function readPageFile(jobId: string, slug: string, filename: string): Promise<string> {
  return await Bun.file(resolvePagePath(jobId, slug, filename)).text();
}

export function sourceKeyFor(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export function pageSlugForUrl(url: string, existingSlugs: Set<string> = new Set()): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return uniqueSlug("page", existingSlugs);
  }
  const segments = parsed.pathname
    .split("/")
    .map((part) => slugPart(part))
    .filter(Boolean);
  const base = segments.length === 0 ? "root" : segments.join("-");
  return uniqueSlug(base, existingSlugs);
}

function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  const slug = `${base}-${i}`;
  existing.add(slug);
  return slug;
}

function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

function slugPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
