import { classifyUrl, type PageKind } from "./classify.ts";
import { fetchHtml, fetchText, isHtmlContentType, USER_AGENT } from "./fetch.ts";
import { htmlToMarkdown, type PageStructure } from "./html-to-md.ts";
import { createRobotsMatcher } from "./robots.ts";
import { crawlSitemaps } from "./sitemap.ts";
import { canonicalize, extractLinks } from "./url.ts";

export { HttpError } from "./fetch.ts";

const CRAWL_CONCURRENCY = Math.max(1, Number(process.env.SCRAPER_CRAWL_CONCURRENCY ?? 5));
const DISCOVER_BATCH_SIZE = Math.max(1, Number(process.env.SCRAPER_DISCOVER_BATCH ?? 25));
const DEFAULT_DISCOVER_LIMIT = Math.max(1, Number(process.env.SCRAPER_DISCOVER_LIMIT ?? 5000));

export interface ScrapeResult {
  markdown: string;
  metadata: ScrapeMetadata;
  structure: PageStructure;
}

export interface ScrapeMetadata {
  sourceURL: string;
  title?: string;
  description?: string;
  author?: string;
  usedReadability: boolean;
}

export interface DiscoverOptions {
  limit?: number;
  includeSubdomains?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: DiscoverEvent) => void;
}

export interface DiscoveredPage {
  url: string;
  kind: PageKind;
}

export type DiscoverEvent =
  | { type: "phase"; phase: "sitemap" | "crawl" }
  | { type: "fetching"; url: string }
  | { type: "fetch-error"; url: string; message: string };

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const { html, finalUrl, contentType } = await fetchHtml(url);
  if (!isHtmlContentType(contentType)) {
    throw new Error(`Unsupported content-type: ${contentType}`);
  }

  const result = htmlToMarkdown({ url: finalUrl, html });
  if (!result.markdown.trim()) {
    throw new Error("Scraper produced empty markdown (likely JS-rendered page)");
  }

  return {
    markdown: result.markdown,
    metadata: {
      sourceURL: finalUrl,
      title: result.title,
      description: result.excerpt,
      author: result.byline,
      usedReadability: result.usedReadability,
    },
    structure: result.structure,
  };
}

export async function* discoverSiteUrlsStream(
  rootUrl: string,
  opts: DiscoverOptions = {},
): AsyncGenerator<DiscoveredPage[], void, void> {
  const limit = opts.limit ?? DEFAULT_DISCOVER_LIMIT;
  const includeSubdomains = opts.includeSubdomains ?? false;
  const signal = opts.signal;
  const rootParsed = new URL(rootUrl);
  const rootHost = rootParsed.hostname.toLowerCase();
  const rootIsHttps = rootParsed.protocol === "https:";

  const matchesOrigin = (u: URL): boolean => {
    const host = u.hostname.toLowerCase();
    return includeSubdomains ? host === rootHost || host.endsWith(`.${rootHost}`) : host === rootHost;
  };

  const robotsText = await fetchText(`${rootParsed.origin}/robots.txt`, signal);
  const robots = createRobotsMatcher(robotsText, USER_AGENT);

  const normalize = (raw: string): string | null => {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (!matchesOrigin(u)) return null;
      if (!robots.isAllowed(u)) return null;
      if (rootIsHttps && u.protocol === "http:") u.protocol = "https:";
      return canonicalize(u);
    } catch {
      return null;
    }
  };

  const seen = new Set<string>();
  let yielded = 0;
  let buffer: DiscoveredPage[] = [];

  const enqueue = (raw: string): boolean => {
    const canonical = normalize(raw);
    if (!canonical || seen.has(canonical)) return false;
    seen.add(canonical);
    buffer.push({ url: canonical, kind: classifyUrl(canonical) });
    yielded += 1;
    return true;
  };

  const flush = (force = false): DiscoveredPage[] | null => {
    if (buffer.length === 0) return null;
    if (!force && buffer.length < DISCOVER_BATCH_SIZE) return null;
    const out = buffer;
    buffer = [];
    return out;
  };

  const emit = (event: DiscoverEvent): void => {
    try {
      opts.onEvent?.(event);
    } catch {}
  };

  enqueue(rootUrl);

  emit({ type: "phase", phase: "sitemap" });
  for await (const sitemapUrl of crawlSitemaps(rootParsed.origin, robotsText, signal)) {
    if (signal?.aborted) return;
    enqueue(sitemapUrl);
    const ready = flush();
    if (ready) yield ready;
    if (yielded >= limit) {
      const tail = flush(true);
      if (tail) yield tail;
      return;
    }
  }

  // Binary URLs (images/documents/assets) are recorded as pages but never
  // fetched during BFS — they cannot contain links.
  const isCrawlable = (url: string): boolean => {
    const kind = classifyUrl(url);
    return kind === "content" || kind === "listing";
  };

  const queue: string[] = [];
  const enqueuedForCrawl = new Set<string>();
  for (const seed of seen) {
    if (!isCrawlable(seed) || enqueuedForCrawl.has(seed)) continue;
    enqueuedForCrawl.add(seed);
    queue.push(seed);
  }

  emit({ type: "phase", phase: "crawl" });
  while (queue.length > 0 && yielded < limit) {
    if (signal?.aborted) return;
    const batchSize = Math.min(CRAWL_CONCURRENCY, queue.length);
    const batch = queue.splice(0, batchSize);
    const fetched = await Promise.all(
      batch.map(async (target) => {
        emit({ type: "fetching", url: target });
        try {
          const { html, finalUrl, contentType } = await fetchHtml(target, signal);
          if (!isHtmlContentType(contentType)) return null;
          return { html, finalUrl };
        } catch (err) {
          if (!signal?.aborted) {
            emit({
              type: "fetch-error",
              url: target,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          return null;
        }
      }),
    );

    for (const result of fetched) {
      if (!result) continue;
      for (const link of extractLinks(result.html, result.finalUrl)) {
        const canonical = normalize(link);
        if (!canonical) continue;
        const isNew = enqueue(canonical);
        if (yielded >= limit) break;
        if (isNew && isCrawlable(canonical) && !enqueuedForCrawl.has(canonical)) {
          enqueuedForCrawl.add(canonical);
          queue.push(canonical);
        }
      }
      if (yielded >= limit) break;
    }

    const ready = flush();
    if (ready) yield ready;
  }

  const tail = flush(true);
  if (tail) yield tail;
}
