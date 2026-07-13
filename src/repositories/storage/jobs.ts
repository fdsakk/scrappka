import { readdir, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  clearMetadataLock,
  readJobMetadata,
  type JobMetadata,
  type MappingMetadata,
  type PageMetadata,
  type PageStatus,
} from "./metadata.ts";
import { resolveJobPath, scrapedRoot, sourceKeyFor, writeJobFile } from "./paths.ts";

export interface JobSummary {
  id: string;
  source: string;
  sourceKey: string;
  createdAt: string;
  updatedAt: string;
  files: string[];
  pages: Record<string, PageMetadata>;
  mapping: MappingMetadata;
}

export interface ProjectListItem {
  id: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  mapping: MappingMetadata;
  counts: Record<PageStatus, number>;
  files: string[];
}

export interface JobIdParts {
  host: string;
  timestamp: string;
  id: string;
}

export async function createJob(sourceUrl: string): Promise<JobIdParts> {
  const hostname = new URL(sourceUrl).hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
  const timestamp = String(Date.now());
  const id = `${hostname}/${timestamp}`;
  const now = new Date().toISOString();
  const metadata: JobMetadata = {
    source: sourceUrl,
    sourceKey: sourceKeyFor(sourceUrl),
    createdAt: now,
    updatedAt: now,
    mapping: { status: "mapping", startedAt: now, discovered: 0 },
    pages: {},
  };
  await writeJobFile(id, "metadata.json", JSON.stringify(metadata, null, 2));
  return { host: hostname, timestamp, id };
}

export async function listScrapeJobs(limit = 20): Promise<ProjectListItem[]> {
  let hosts;
  try {
    hosts = await readdir(scrapedRoot(), { withFileTypes: true });
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const host of hosts) {
    if (!host.isDirectory()) continue;
    let entries;
    try {
      entries = await readdir(resolveJobPath(host.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) ids.push(`${host.name}/${entry.name}`);
    }
  }

  const newestIds = ids
    .sort((a, b) => timestampFromId(b) - timestampFromId(a))
    .slice(0, limit);
  const summaries = await Promise.all(newestIds.map((id) => getScrapeJobSummary(id)));
  return summaries
    .filter((s): s is JobSummary => s != null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((summary) => ({
      id: summary.id,
      source: summary.source,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      mapping: summary.mapping,
      counts: statusCounts(summary.pages),
      files: summary.files,
    }));
}

export async function deleteScrapeJob(jobId: string): Promise<boolean> {
  const dir = resolveJobPath(jobId);
  if (dir === scrapedRoot()) throw new Error("Refusing to delete root");
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    return false;
  }
  clearMetadataLock(jobId);
  const host = jobId.split("/")[0];
  if (host) {
    try {
      const remaining = await readdir(resolveJobPath(host));
      if (remaining.length === 0) await rm(resolveJobPath(host), { recursive: true, force: true });
    } catch {}
  }
  return true;
}

export async function getScrapeJobSummary(jobId: string): Promise<JobSummary | null> {
  let files;
  try {
    files = await listJobFiles(jobId);
  } catch {
    return null;
  }

  const metadata = await readJobMetadata(jobId);
  if (!metadata) return null;

  return {
    id: jobId,
    source: metadata.source,
    sourceKey: metadata.sourceKey,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    files,
    pages: metadata.pages,
    mapping: metadata.mapping,
  };
}

async function listJobFiles(jobId: string): Promise<string[]> {
  const root = resolveJobPath(jobId);
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (dir === root && entry.isDirectory() && entry.name === "pages") continue;
      const path = resolve(dir, entry.name);
      const name = relative(root, path).split(sep).join("/");
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        out.push(name);
      }
    }
  }

  await walk(root);
  return out.sort();
}

function timestampFromId(id: string): number {
  const raw = id.slice(id.lastIndexOf("/") + 1);
  const timestamp = Number(raw);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function statusCounts(pages: Record<string, PageMetadata>): Record<PageStatus, number> {
  const counts: Record<PageStatus, number> = {
    pending: 0,
    scraping: 0,
    done: 0,
    failed: 0,
    skipped: 0,
  };
  for (const page of Object.values(pages)) counts[page.status] = (counts[page.status] ?? 0) + 1;
  return counts;
}
