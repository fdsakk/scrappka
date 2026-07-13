import { createHash } from "node:crypto";
import { classifyUrl, isPageKind, type PageKind } from "../../scraper/classify.ts";
import { pageSlugForUrl, readJobFile, sourceKeyFor, writeJobFile } from "./paths.ts";

export type PageStatus = "pending" | "scraping" | "done" | "failed" | "skipped";
export type MappingStatus = "mapping" | "mapped" | "failed" | "cancelled";

export interface MappingActivity {
  phase: "sitemap" | "crawl";
  lastUrl?: string;
  fetchErrors: number;
  lastError?: { url: string; message: string; at: string };
  updatedAt: string;
}

export interface MappingMetadata {
  status: MappingStatus;
  startedAt: string;
  finishedAt?: string;
  discovered: number;
  error?: string;
  activity?: MappingActivity;
}

export interface PageMetadata {
  url: string;
  status: PageStatus;
  kind: PageKind;
  contentHash?: string;
  scrapedAt?: string;
  error?: string;
}

export interface JobMetadata {
  source: string;
  sourceKey: string;
  createdAt: string;
  updatedAt: string;
  mapping: MappingMetadata;
  pages: Record<string, PageMetadata>;
}

const metadataLocks = new Map<string, Promise<unknown>>();
const jobListeners = new Map<string, Set<(metadata: JobMetadata) => void>>();

export function clearMetadataLock(jobId: string): void {
  metadataLocks.delete(jobId);
}

export function subscribeJobMetadata(jobId: string, listener: (metadata: JobMetadata) => void): () => void {
  let set = jobListeners.get(jobId);
  if (!set) {
    set = new Set();
    jobListeners.set(jobId, set);
  }
  set.add(listener);
  return () => {
    const s = jobListeners.get(jobId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) jobListeners.delete(jobId);
  };
}

function emitJobMetadata(jobId: string, metadata: JobMetadata): void {
  const set = jobListeners.get(jobId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(metadata);
    } catch {}
  }
}

export async function updateJobMetadata(
  jobId: string,
  updater: (metadata: JobMetadata) => JobMetadata,
): Promise<JobMetadata> {
  const previous = metadataLocks.get(jobId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const existing = await readJobMetadata(jobId);
      if (!existing) throw new Error("Job metadata not found");
      const candidate = updater(existing);
      if (candidate === existing) return existing;
      const updated = { ...candidate, updatedAt: new Date().toISOString() };
      await writeJobFile(jobId, "metadata.json", JSON.stringify(updated, null, 2));
      emitJobMetadata(jobId, updated);
      return updated;
    });
  metadataLocks.set(jobId, next);
  try {
    return await next;
  } finally {
    if (metadataLocks.get(jobId) === next) metadataLocks.delete(jobId);
  }
}

export async function updatePageStatus(
  jobId: string,
  slug: string,
  patch: Partial<PageMetadata>,
): Promise<JobMetadata> {
  return await updateJobMetadata(jobId, (metadata) => {
    const existing = metadata.pages[slug];
    if (!existing) throw new Error(`Page ${slug} not found in job ${jobId}`);
    return {
      ...metadata,
      pages: { ...metadata.pages, [slug]: { ...existing, ...patch } },
    };
  });
}

export async function updatePageStatuses(
  jobId: string,
  patches: Record<string, Partial<PageMetadata>>,
): Promise<JobMetadata> {
  return await updateJobMetadata(jobId, (metadata) => {
    const pages = { ...metadata.pages };
    for (const [slug, patch] of Object.entries(patches)) {
      const existing = pages[slug];
      if (!existing) throw new Error(`Page ${slug} not found in job ${jobId}`);
      pages[slug] = { ...existing, ...patch };
    }
    return { ...metadata, pages };
  });
}

/**
 * Atomically add a batch of newly-discovered URLs to a job. De-duplicates
 * against already-stored pages and assigns unique slugs. No-op once the job
 * is no longer in `mapping` status.
 */
export async function appendPages(
  jobId: string,
  pages: { url: string; kind: PageKind }[],
  opts: { force?: boolean } = {},
): Promise<void> {
  await updateJobMetadata(jobId, (metadata) => {
    if (!opts.force && metadata.mapping.status !== "mapping") return metadata;
    const seenSlugs = new Set(Object.keys(metadata.pages));
    const seenUrls = new Set(Object.values(metadata.pages).map((p) => p.url));
    const nextPages = { ...metadata.pages };
    for (const { url, kind } of pages) {
      if (seenUrls.has(url)) continue;
      const slug = pageSlugForUrl(url, seenSlugs);
      seenUrls.add(url);
      nextPages[slug] = { url, status: "pending", kind };
    }
    return {
      ...metadata,
      mapping: { ...metadata.mapping, discovered: Object.keys(nextPages).length },
      pages: nextPages,
    };
  });
}

/**
 * Records live discovery telemetry on the mapping block. Only applied while
 * the job is still in `mapping` status so late callbacks can't resurrect a
 * finished job's activity.
 */
export async function updateMappingActivity(jobId: string, activity: MappingActivity): Promise<void> {
  await updateJobMetadata(jobId, (metadata) => {
    if (metadata.mapping.status !== "mapping") return metadata;
    return { ...metadata, mapping: { ...metadata.mapping, activity } };
  });
}

export async function finalizeMapping(
  jobId: string,
  outcome: { status: "mapped" } | { status: "cancelled" } | { status: "failed"; error: string },
): Promise<void> {
  await updateJobMetadata(jobId, (metadata) => {
    // A late callback must not resurrect a job the user already stopped: once
    // mapping is terminal, keep the first terminal status.
    if (metadata.mapping.status !== "mapping") return metadata;
    return {
      ...metadata,
      mapping: {
        ...metadata.mapping,
        status: outcome.status,
        finishedAt: new Date().toISOString(),
        error: outcome.status === "failed" ? outcome.error : undefined,
      },
    };
  });
}

/**
 * Flips a terminal job back to `mapping` so it can be re-crawled in place
 * ("Map again"). Clears the previous run's `finishedAt`/`error`/`activity`.
 * No-op if a mapping is already running. Returns the job's source URL so the
 * caller can restart discovery, or null if the job is missing / still mapping.
 */
export async function reopenMapping(jobId: string): Promise<string | null> {
  let source: string | null = null;
  await updateJobMetadata(jobId, (metadata) => {
    if (metadata.mapping.status === "mapping") return metadata;
    source = metadata.source;
    return {
      ...metadata,
      mapping: {
        ...metadata.mapping,
        status: "mapping",
        finishedAt: undefined,
        error: undefined,
        activity: undefined,
      },
    };
  });
  return source;
}

export function pageContentUnchanged(existing: PageMetadata | undefined, content: string): boolean {
  if (!existing?.contentHash) return false;
  return existing.contentHash === contentHashFor(content);
}

export function contentHashFor(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function readJobMetadata(jobId: string): Promise<JobMetadata | null> {
  try {
    const parsed = JSON.parse(await readJobFile(jobId, "metadata.json")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.source !== "string") return null;

    const mapping = normalizeMapping(record.mapping);
    if (!mapping) return null;

    return {
      source: record.source,
      sourceKey: typeof record.sourceKey === "string" ? record.sourceKey : sourceKeyFor(record.source),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : mapping.startedAt,
      updatedAt:
        typeof record.updatedAt === "string"
          ? record.updatedAt
          : typeof record.createdAt === "string"
            ? record.createdAt
            : mapping.startedAt,
      mapping,
      pages: normalizePages(record.pages),
    };
  } catch {
    return null;
  }
}

function normalizeMapping(value: unknown): MappingMetadata | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (!isMappingStatus(r.status)) return null;
  if (typeof r.startedAt !== "string") return null;
  return {
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: typeof r.finishedAt === "string" ? r.finishedAt : undefined,
    discovered: typeof r.discovered === "number" ? r.discovered : 0,
    error: typeof r.error === "string" ? r.error : undefined,
    activity: normalizeActivity(r.activity),
  };
}

function normalizeActivity(value: unknown): MappingActivity | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as Record<string, unknown>;
  if (r.phase !== "sitemap" && r.phase !== "crawl") return undefined;
  if (typeof r.updatedAt !== "string") return undefined;
  const lastError = r.lastError as Record<string, unknown> | undefined;
  return {
    phase: r.phase,
    lastUrl: typeof r.lastUrl === "string" ? r.lastUrl : undefined,
    fetchErrors: typeof r.fetchErrors === "number" ? r.fetchErrors : 0,
    lastError:
      lastError &&
      typeof lastError === "object" &&
      typeof lastError.url === "string" &&
      typeof lastError.message === "string" &&
      typeof lastError.at === "string"
        ? { url: lastError.url, message: lastError.message, at: lastError.at }
        : undefined,
    updatedAt: r.updatedAt,
  };
}

function isMappingStatus(value: unknown): value is MappingStatus {
  return value === "mapping" || value === "mapped" || value === "failed" || value === "cancelled";
}

function normalizePages(value: unknown): Record<string, PageMetadata> {
  const out: Record<string, PageMetadata> = {};
  if (!value || typeof value !== "object") return out;
  for (const [slug, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.url !== "string") continue;
    out[slug] = {
      url: r.url,
      status: isPageStatus(r.status) ? r.status : "pending",
      kind: isPageKind(r.kind) ? r.kind : classifyUrl(r.url),
      contentHash: typeof r.contentHash === "string" ? r.contentHash : undefined,
      scrapedAt: typeof r.scrapedAt === "string" ? r.scrapedAt : undefined,
      error: typeof r.error === "string" ? r.error : undefined,
    };
  }
  return out;
}

function isPageStatus(value: unknown): value is PageStatus {
  return value === "pending" || value === "scraping" || value === "done" || value === "failed" || value === "skipped";
}
