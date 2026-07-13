import { JSDOM } from "jsdom";
import { TRACKING_PARAMS } from "./html-to-md.ts";

/** Canonical URL form used for de-duplication: no hash, lowercase host, no trailing slash, tracking params stripped. */
export function canonicalize(u: URL): string {
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  for (const key of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  if (u.search === "?") u.search = "";
  return u.toString();
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  try {
    const dom = new JSDOM(html, { url: baseUrl });
    const anchors = dom.window.document.querySelectorAll("a[href]");
    for (const a of Array.from(anchors)) {
      const href = a.getAttribute("href");
      if (!href) continue;
      if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }
      try {
        out.push(new URL(href, baseUrl).toString());
      } catch {}
    }
  } catch {}
  return out;
}
