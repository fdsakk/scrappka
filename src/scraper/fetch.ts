import { assertPublicUrl } from "./ssrf-guard.ts";

export const USER_AGENT =
  process.env.SCRAPER_UA ??
  "Mozilla/5.0 (compatible; WebScrapperBot/0.1; +https://example.com/bot)";
const FETCH_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS ?? 15000);
const MAX_RESPONSE_BYTES = Math.max(1, Number(process.env.SCRAPER_MAX_BYTES ?? 10_000_000));
const MAX_REDIRECTS = 5;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchHtml(
  url: string,
  parentSignal?: AbortSignal,
): Promise<{ html: string; finalUrl: string; contentType: string }> {
  const result = await fetchPublicText(url, {
    signal: parentSignal,
    maxBytes: MAX_RESPONSE_BYTES,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  return { html: result.text, finalUrl: result.finalUrl, contentType: result.contentType };
}

/** Best-effort text fetch (robots.txt, sitemaps): null on any failure. */
export async function fetchText(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    return (await fetchPublicText(url, { signal, maxBytes: MAX_RESPONSE_BYTES })).text;
  } catch {
    return null;
  }
}

export interface PublicTextResult {
  text: string;
  finalUrl: string;
  contentType: string;
}

/**
 * Fetches public HTTP(S) text while validating every redirect before it is
 * requested. Native redirect following is deliberately disabled: checking
 * only `response.url` is too late because the redirected target has already
 * received a request.
 */
export async function fetchPublicText(
  url: string,
  opts: { signal?: AbortSignal; maxBytes?: number; headers?: HeadersInit } = {},
): Promise<PublicTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onParentAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onParentAbort, { once: true });
  let current = url;
  const headers = new Headers(opts.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertPublicUrl(current);
      const response = await fetch(current, {
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) throw new HttpError(response.status, `Redirect without Location for ${current}`);
        if (redirects === MAX_REDIRECTS) throw new Error(`Too many redirects for ${url}`);
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) throw new HttpError(response.status, `HTTP ${response.status} for ${current}`);
      const text = await readBodyCapped(response, opts.maxBytes ?? MAX_RESPONSE_BYTES);
      return {
        text,
        finalUrl: current,
        contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
      };
    }
    throw new Error(`Too many redirects for ${url}`);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onParentAbort);
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Reads a response body but aborts once it exceeds `maxBytes`, so a hostile or
 * runaway page can't exhaust memory. `Content-Length` is a fast pre-check; the
 * streamed accumulation is the real cap (the header can lie or be absent).
 */
async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`Response too large: ${declared} bytes`);
  if (!res.body) return await res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Response exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function isHtmlContentType(contentType: string): boolean {
  return contentType.includes("text/html") || contentType.includes("application/xhtml");
}
