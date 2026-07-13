import { fetchText } from "./fetch.ts";

const MAX_SITEMAPS_VISITED = 50;

/**
 * Yields page URLs from the site's sitemaps: the conventional locations plus
 * any `Sitemap:` entries in robots.txt, following sitemap-index nesting up to
 * `MAX_SITEMAPS_VISITED` documents.
 */
export async function* crawlSitemaps(
  origin: string,
  robotsText: string | null,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const candidates = new Set<string>([
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ]);

  if (robotsText) {
    for (const line of robotsText.split(/\r?\n/)) {
      const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
      if (match?.[1]) candidates.add(match[1].trim());
    }
  }

  const queue = [...candidates];
  const visited = new Set<string>();
  while (queue.length > 0 && visited.size < MAX_SITEMAPS_VISITED) {
    if (signal?.aborted) return;
    const sitemap = queue.shift();
    if (!sitemap || visited.has(sitemap)) continue;
    visited.add(sitemap);
    const xml = await fetchText(sitemap, signal);
    if (!xml) continue;
    const { urls, sitemaps } = parseSitemapXml(xml);
    for (const url of urls) yield url;
    for (const nested of sitemaps) if (!visited.has(nested)) queue.push(nested);
  }
}

function parseSitemapXml(xml: string): { urls: string[]; sitemaps: string[] } {
  const urls: string[] = [];
  const sitemaps: string[] = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const value = decodeXmlEntities(match[1].trim());
    if (isIndex) sitemaps.push(value);
    else urls.push(value);
  }
  return { urls, sitemaps };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
