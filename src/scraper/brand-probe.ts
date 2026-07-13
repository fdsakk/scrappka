import { JSDOM } from "jsdom";
import { fetchPublicText } from "./fetch.ts";

const MAX_CSS_BYTES = 200_000;
const MAX_STYLESHEETS = 3;

export interface BrandColor {
  hex: string;
  sources: string[];
}

export interface BrandFont {
  family: string;
  usage?: "heading" | "body";
}

export interface BrandData {
  colors: BrandColor[];
  themeColor?: string;
  fonts: BrandFont[];
  logoUrl?: string;
  logoConfidence: number;
  logoEvidence?: string;
  faviconUrl?: string;
  ogImageUrl?: string;
  cssVars: Record<string, string>;
  warnings: string[];
}

export async function probeBrand(rootUrl: string): Promise<BrandData> {
  const empty: BrandData = { colors: [], fonts: [], cssVars: {}, logoConfidence: 0, warnings: ["brand_probe_failed"] };
  let html: string;
  let finalUrl: string;
  try {
    const r = await fetchTextLimited(rootUrl);
    if (!r) return empty;
    html = r.text;
    finalUrl = r.url;
  } catch {
    return empty;
  }

  try {
    return await extractBrandFromHtml(html, finalUrl);
  } catch {
    return empty;
  }
}

export async function extractBrandFromHtml(html: string, baseUrl: string): Promise<BrandData> {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  const themeColor = doc.querySelector('meta[name="theme-color"]')?.getAttribute("content")?.trim() || undefined;
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() || undefined;
  const faviconUrl = pickFaviconUrl(doc, baseUrl);
  const logoCandidate = pickLogoCandidate(doc, baseUrl);
  const logoUrl = logoCandidate?.url ?? faviconUrl;
  const ogImageUrl = absolutize(ogImage, baseUrl);

  const cssSources: string[] = [];
  for (const styleEl of Array.from(doc.querySelectorAll("style"))) {
    if (styleEl.textContent) cssSources.push(styleEl.textContent);
  }

  const links = Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))
    .map((el) => el.getAttribute("href"))
    .filter((h): h is string => Boolean(h))
    .map((h) => absolutize(h, baseUrl))
    .filter((h): h is string => Boolean(h))
    .slice(0, MAX_STYLESHEETS);

  for (const href of links) {
    try {
      const r = await fetchTextLimited(href, MAX_CSS_BYTES);
      if (r) cssSources.push(r.text);
    } catch {}
  }

  const allCss = cssSources.join("\n");
  const cssVars = selectRelevantCssVars(extractCssVars(allCss));
  const colors = extractColors(allCss, themeColor);
  const fonts = extractFonts(allCss);

  const warnings: string[] = [];
  if (!logoCandidate && faviconUrl) warnings.push("logo_candidate_uncertain");
  if (!logoUrl) warnings.push("logo_missing");
  const result: BrandData = {
    colors,
    fonts,
    cssVars,
    logoConfidence: logoCandidate?.confidence ?? (faviconUrl ? 0.35 : 0),
    warnings,
  };
  if (themeColor) result.themeColor = themeColor;
  if (logoUrl) result.logoUrl = logoUrl;
  if (logoCandidate?.evidence) result.logoEvidence = logoCandidate.evidence;
  if (faviconUrl) result.faviconUrl = faviconUrl;
  if (ogImageUrl) result.ogImageUrl = ogImageUrl;
  return result;
}

function pickFaviconUrl(doc: Document, base: string): string | undefined {
  const candidates = [
    'link[rel="apple-touch-icon"]',
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
  ];
  for (const sel of candidates) {
    const href = doc.querySelector(sel)?.getAttribute("href");
    const abs = absolutize(href, base);
    if (abs) return abs;
  }
  return undefined;
}

interface LogoCandidate {
  url: string;
  confidence: number;
  evidence: string;
}

function pickLogoCandidate(doc: Document, base: string): LogoCandidate | undefined {
  const homeUrl = new URL(base).origin;
  const og = doc.querySelector('meta[property="og:logo"], meta[name="logo"]')?.getAttribute("content");
  const ogAbs = absolutize(og, base);
  if (ogAbs) return { url: ogAbs, confidence: 0.82, evidence: "logo meta tag" };

  const candidates: LogoCandidate[] = [];
  for (const img of Array.from(doc.querySelectorAll("img[src], img[data-src]"))) {
    if (isDisallowedLogoContext(img)) continue;
    const src = img.getAttribute("src") || img.getAttribute("data-src");
    const url = absolutize(src, base);
    if (!url) continue;
    const alt = `${img.getAttribute("alt") ?? ""} ${img.getAttribute("title") ?? ""}`.trim();
    const attrs = `${alt} ${img.getAttribute("class") ?? ""} ${img.getAttribute("id") ?? ""} ${src ?? ""}`;
    let score = 0;
    const evidence: string[] = [];
    const inHeader = Boolean(img.closest("header, [role='banner'], .header, #header, .site-header"));
    if (inHeader) {
      score += 0.38;
      evidence.push("header image");
    }
    const link = img.closest("a[href]");
    const href = link?.getAttribute("href");
    if (href && pointsToHome(href, base, homeUrl)) {
      score += 0.34;
      evidence.push("linking to homepage");
    }
    if (/\blogo\b|logotyp|brand|site-logo/i.test(attrs)) {
      score += 0.24;
      evidence.push("logo/brand attribute");
    }
    if (/client|partner|reference|realizac|portfolio|case|product|produkt|certificate|certyfikat|ads?|reklam/i.test(attrs)) {
      score -= 0.35;
    }
    if (score <= 0) continue;
    candidates.push({
      url,
      confidence: Number(Math.max(0.2, Math.min(0.96, score)).toFixed(2)),
      evidence: evidence.join(" + ") || "weak image candidate",
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0];
}

function isDisallowedLogoContext(el: Element): boolean {
  return Boolean(
    el.closest(
      [
        ".clients",
        ".client",
        ".references",
        ".reference",
        ".partners",
        ".partner",
        ".portfolio",
        ".realizations",
        ".realizacje",
        ".case-study",
        ".product",
        ".products",
        ".certificate",
        ".certificates",
        ".ads",
        ".advert",
        "article",
        "main",
      ].join(","),
    ),
  );
}

function pointsToHome(href: string, base: string, homeUrl: string): boolean {
  try {
    const u = new URL(href, base);
    return u.href === `${homeUrl}/` || u.href === homeUrl;
  } catch {
    return href === "/" || href === "";
  }
}

function absolutize(href: string | null | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

export function extractCssVars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const name = m[1];
    const value = m[2].trim();
    if (!out[name]) out[name] = value;
  }
  return out;
}

export function extractColors(css: string, seed?: string): BrandColor[] {
  const counts = new Map<string, number>();
  const bump = (raw: string) => {
    const hex = normalizeColor(raw);
    if (!hex) return;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  if (seed) bump(seed);

  const hexRe = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(css))) bump(`#${m[1]}`);

  const rgbRe = /rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/g;
  while ((m = rgbRe.exec(css))) {
    const hex = rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
    if (hex) bump(hex);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const accents = sorted.filter((hex) => !isNeutralHex(hex));
  const neutrals = sorted.filter((hex) => isNeutralHex(hex));
  return [...accents, ...neutrals].slice(0, 8).map((hex) => ({ hex, sources: [] }));
}

/**
 * Near-grayscale and near-white/black colors dominate raw frequency counts
 * (backgrounds, text, borders) and drown out the actual brand accents, so
 * they are sorted behind saturated colors.
 */
export function isNeutralHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 24) return true;
  if (min > 243) return true;
  if (max < 13) return true;
  return false;
}

const RELEVANT_VAR_NAME =
  /(color|primary|secondary|accent|brand|background|bg\b|foreground|surface|text|font|radius|ring|border|muted|shadow|spacing)/i;
const COLORISH_VALUE = /#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|oklab)\(/i;
const MAX_CSS_VARS = 40;

/**
 * Tailwind/utility builds emit hundreds of CSS variables; keep only the ones
 * that look brand-relevant (color/typography/shape) so the LLM prompt stays
 * focused.
 */
export function selectRelevantCssVars(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  let kept = 0;
  for (const [name, value] of Object.entries(vars)) {
    if (!RELEVANT_VAR_NAME.test(name) && !COLORISH_VALUE.test(value)) continue;
    out[name] = value;
    kept += 1;
    if (kept >= MAX_CSS_VARS) break;
  }
  return out;
}

export function extractFonts(css: string): BrandFont[] {
  const seen = new Map<string, BrandFont>();
  const re = /font-family\s*:\s*([^;}\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (!first || /^(inherit|initial|unset|var\()/i.test(first)) continue;
    if (!seen.has(first)) seen.set(first, { family: first });
  }
  return [...seen.values()].slice(0, 6);
}

function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  const hexMatch = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    if (h.length === 8) return `#${h.slice(0, 6)}`;
    return `#${h}`;
  }
  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/);
  if (rgbMatch) return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  return null;
}

function rgbToHex(r: number, g: number, b: number): string | null {
  if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

async function fetchTextLimited(url: string, maxBytes?: number): Promise<{ text: string; url: string } | null> {
  try {
    const result = await fetchPublicText(url, { maxBytes });
    return { text: result.text, url: result.finalUrl };
  } catch {
    return null;
  }
}
