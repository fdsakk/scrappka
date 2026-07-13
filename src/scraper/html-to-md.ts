import { JSDOM, VirtualConsole } from "jsdom";
import { Readability, isProbablyReaderable } from "@mozilla/readability";
import TurndownService from "turndown";
// @ts-expect-error - turndown-plugin-gfm has no types
import { gfm } from "turndown-plugin-gfm";

export interface HtmlToMdOptions {
  url: string;
  html: string;
  useReadability?: boolean;
}

export interface HtmlToMdResult {
  markdown: string;
  title?: string;
  excerpt?: string;
  byline?: string;
  usedReadability: boolean;
  structure: PageStructure;
}

export interface PageHeading {
  level: number;
  text: string;
}

export interface PageFormField {
  tag: string;
  type?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export interface PageForm {
  action?: string;
  method?: string;
  fields: PageFormField[];
  submitLabel?: string;
}

export interface PageLink {
  text: string;
  href: string;
}

export interface ProductData {
  name?: string;
  description?: string;
  price?: string;
  currency?: string;
  sku?: string;
  brand?: string;
  category?: string;
  images?: string[];
}

/**
 * Machine-readable signals for page-type classification: structured data
 * (JSON-LD / OpenGraph) plus cheap commerce heuristics. Deterministic —
 * no LLM involved.
 */
export interface PageSignals {
  ogType?: string;
  jsonLdTypes: string[];
  product?: ProductData;
  hasPrice: boolean;
  hasCartButton: boolean;
}

/**
 * Structural evidence extracted from the full document before noise stripping.
 * Forms, nav and footer are removed from the markdown output, so this is the
 * only place their content survives for the OpenSpec bundle.
 */
export interface PageStructure {
  headings: PageHeading[];
  forms: PageForm[];
  nav: PageLink[];
  footerText?: string;
  signals?: PageSignals;
}

const MAX_HEADINGS = 60;
const MAX_NAV_LINKS = 40;
const MAX_FORMS = 10;
const MAX_FORM_FIELDS = 25;
const MAX_FOOTER_CHARS = 600;

export const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "mc_cid", "mc_eid",
  "yclid", "_ga", "ref", "ref_src",
]);

const DROP_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "form",
  "[aria-hidden='true']", "[hidden]",
  "nav", "footer", "header[role='banner']",
  ".cookie-banner", ".cookie-consent", "#cookie-banner",
  "[role='dialog']", "[role='alertdialog']",
];

export function htmlToMarkdown(opts: HtmlToMdOptions): HtmlToMdResult {
  const useReadability = opts.useReadability ?? true;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", () => {});
  virtualConsole.on("warn", () => {});
  virtualConsole.on("jsdomError", () => {});

  const dom = new JSDOM(opts.html, { url: opts.url, virtualConsole });
  const doc = dom.window.document;

  resolveRelativeUrls(doc, opts.url);
  stripTrackingParams(doc);
  unwrapPictures(doc);

  const structure = extractPageStructure(doc);

  let contentHtml: string;
  let title: string | undefined;
  let excerpt: string | undefined;
  let byline: string | undefined;
  let usedReadability = false;

  if (useReadability && isProbablyReaderable(doc)) {
    const cloned = doc.cloneNode(true) as Document;
    const article = new Readability(cloned, { keepClasses: false }).parse();
    if (article && article.content && article.content.length > 200) {
      contentHtml = article.content;
      title = article.title ?? undefined;
      excerpt = article.excerpt ?? undefined;
      byline = article.byline ?? undefined;
      usedReadability = true;
    } else {
      contentHtml = stripNoiseFrom(pickFallbackRoot(doc));
    }
  } else {
    contentHtml = stripNoiseFrom(pickFallbackRoot(doc));
  }

  if (!title) {
    const h1 = doc.querySelector("h1");
    title = h1?.textContent?.trim() || doc.title?.trim() || undefined;
  }

  const markdown = postProcess(turndown().turndown(contentHtml));
  return { markdown, title, excerpt, byline, usedReadability, structure };
}

export function extractPageStructure(doc: Document): PageStructure {
  const headings: PageHeading[] = [];
  for (const el of Array.from(doc.querySelectorAll("h1, h2, h3"))) {
    const text = el.textContent?.replace(/\s+/g, " ").trim();
    if (!text) continue;
    headings.push({ level: Number(el.tagName[1]), text });
    if (headings.length >= MAX_HEADINGS) break;
  }

  const forms: PageForm[] = [];
  for (const formEl of Array.from(doc.querySelectorAll("form")).slice(0, MAX_FORMS)) {
    const fields: PageFormField[] = [];
    for (const fieldEl of Array.from(formEl.querySelectorAll("input, textarea, select"))) {
      const type = fieldEl.getAttribute("type")?.toLowerCase();
      if (type === "hidden" || type === "submit" || type === "button") continue;
      const field: PageFormField = { tag: fieldEl.tagName.toLowerCase() };
      if (type) field.type = type;
      const name = fieldEl.getAttribute("name");
      if (name) field.name = name;
      const label = labelFor(fieldEl, doc);
      if (label) field.label = label;
      const placeholder = fieldEl.getAttribute("placeholder");
      if (placeholder) field.placeholder = placeholder;
      if (fieldEl.hasAttribute("required")) field.required = true;
      fields.push(field);
      if (fields.length >= MAX_FORM_FIELDS) break;
    }
    if (fields.length === 0) continue;
    const form: PageForm = { fields };
    const action = formEl.getAttribute("action");
    if (action) form.action = action;
    const method = formEl.getAttribute("method");
    if (method) form.method = method.toLowerCase();
    const submitLabel = submitLabelFor(formEl);
    if (submitLabel) form.submitLabel = submitLabel;
    forms.push(form);
  }

  const nav: PageLink[] = [];
  const seenNav = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll("nav a[href], header a[href]"))) {
    const href = a.getAttribute("href");
    const text = a.textContent?.replace(/\s+/g, " ").trim();
    if (!href || !text) continue;
    if (href.startsWith("#") || href.startsWith("javascript:")) continue;
    const key = `${text}|${href}`;
    if (seenNav.has(key)) continue;
    seenNav.add(key);
    nav.push({ text, href });
    if (nav.length >= MAX_NAV_LINKS) break;
  }

  const structure: PageStructure = { headings, forms, nav };
  const footerText = doc.querySelector("footer")?.textContent?.replace(/\s+/g, " ").trim();
  if (footerText) structure.footerText = footerText.slice(0, MAX_FOOTER_CHARS);
  structure.signals = extractPageSignals(doc);
  return structure;
}

const PRICE_REGEX = /\d{1,6}(?:[.,]\d{2})?\s*(?:zł|PLN|€|EUR|\$|USD|£|GBP)/;
const CART_REGEX = /(dodaj do koszyka|do koszyka|kup teraz|dodaj do zam[oó]wienia|add to cart|add to basket|buy now)/i;

export function extractPageSignals(doc: Document): PageSignals {
  const jsonLdTypes: string[] = [];
  let product: ProductData | undefined;

  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    for (const node of flattenJsonLd(parsed)) {
      const types = jsonLdTypeOf(node);
      for (const t of types) {
        if (!jsonLdTypes.includes(t)) jsonLdTypes.push(t);
      }
      if (!product && types.includes("Product")) product = productFromJsonLd(node);
    }
  }

  const ogType = doc
    .querySelector('meta[property="og:type"]')
    ?.getAttribute("content")
    ?.trim()
    ?.toLowerCase();

  const bodyText = (doc.body?.textContent ?? "").slice(0, 50_000);
  const hasPrice = PRICE_REGEX.test(bodyText);
  let hasCartButton = false;
  for (const el of Array.from(doc.querySelectorAll("button, a, input[type='submit']"))) {
    const text = `${el.textContent ?? ""} ${el.getAttribute("value") ?? ""} ${el.getAttribute("aria-label") ?? ""}`;
    if (CART_REGEX.test(text)) {
      hasCartButton = true;
      break;
    }
  }

  const signals: PageSignals = { jsonLdTypes, hasPrice, hasCartButton };
  if (ogType) signals.ogType = ogType;
  if (product) signals.product = product;
  return signals;
}

function flattenJsonLd(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((v) => flattenJsonLd(v, depth + 1));
  const record = value as Record<string, unknown>;
  const out = [record];
  if (record["@graph"]) out.push(...flattenJsonLd(record["@graph"], depth + 1));
  return out;
}

function jsonLdTypeOf(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  return [];
}

function productFromJsonLd(node: Record<string, unknown>): ProductData {
  const product: ProductData = {};
  if (typeof node.name === "string") product.name = node.name.trim();
  if (typeof node.description === "string") product.description = node.description.trim().slice(0, 2000);
  if (typeof node.sku === "string") product.sku = node.sku;
  if (typeof node.category === "string") product.category = node.category;

  const brand = node.brand;
  if (typeof brand === "string") product.brand = brand;
  else if (brand && typeof brand === "object" && typeof (brand as Record<string, unknown>).name === "string") {
    product.brand = (brand as Record<string, unknown>).name as string;
  }

  const images = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
  const imageUrls = images
    .map((img) =>
      typeof img === "string"
        ? img
        : img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string"
          ? ((img as Record<string, unknown>).url as string)
          : null,
    )
    .filter((u): u is string => u != null);
  if (imageUrls.length > 0) product.images = imageUrls.slice(0, 10);

  const offers = flattenJsonLd(node.offers);
  for (const offer of offers) {
    const price = offer.price ?? offer.lowPrice;
    if (typeof price === "string" || typeof price === "number") {
      product.price = String(price);
      if (typeof offer.priceCurrency === "string") product.currency = offer.priceCurrency;
      break;
    }
  }
  return product;
}

function labelFor(field: Element, doc: Document): string | undefined {
  const id = field.getAttribute("id");
  if (id) {
    const label = doc.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`);
    const text = label?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  const wrapping = field.closest("label");
  const wrapText = wrapping?.textContent?.replace(/\s+/g, " ").trim();
  if (wrapText) return wrapText;
  const aria = field.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  return undefined;
}

function submitLabelFor(formEl: Element): string | undefined {
  const button =
    formEl.querySelector('button[type="submit"]') ??
    formEl.querySelector('input[type="submit"]') ??
    formEl.querySelector("button");
  if (!button) return undefined;
  const text = button.textContent?.replace(/\s+/g, " ").trim();
  return text || button.getAttribute("value")?.trim() || undefined;
}

function pickFallbackRoot(doc: Document): Element {
  return (
    doc.querySelector("main") ||
    doc.querySelector("article") ||
    doc.querySelector("[role='main']") ||
    doc.body
  );
}

function stripNoiseFrom(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const sel of DROP_SELECTORS) {
    for (const el of Array.from(clone.querySelectorAll(sel))) el.remove();
  }
  const walker = clone.ownerDocument!.createTreeWalker(clone, 0x80);
  const toRemove: Node[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) toRemove.push(n);
  for (const node of toRemove) node.parentNode?.removeChild(node);
  return clone.innerHTML || "";
}

function resolveRelativeUrls(doc: Document, baseUrl: string): void {
  const base = new URL(baseUrl);
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      a.setAttribute("href", new URL(href, base).toString());
    } catch {}
  }
  for (const img of Array.from(doc.querySelectorAll("img[src], img[data-src]"))) {
    const src = img.getAttribute("src") || img.getAttribute("data-src");
    if (!src) continue;
    try {
      img.setAttribute("src", new URL(src, base).toString());
    } catch {}
  }
}

function stripTrackingParams(doc: Document): void {
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (!href) continue;
    try {
      const u = new URL(href);
      let changed = false;
      for (const key of Array.from(u.searchParams.keys())) {
        if (TRACKING_PARAMS.has(key.toLowerCase())) {
          u.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) a.setAttribute("href", u.toString());
    } catch {}
  }
}

function unwrapPictures(doc: Document): void {
  for (const pic of Array.from(doc.querySelectorAll("picture"))) {
    const img = pic.querySelector("img");
    if (img) pic.replaceWith(img);
    else pic.remove();
  }
}

function turndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  td.use(gfm);

  td.addRule("fencedCodeWithLang", {
    filter: (node) => node.nodeName === "PRE" && !!node.firstChild && node.firstChild.nodeName === "CODE",
    replacement: (_content, node) => {
      const code = (node as HTMLElement).querySelector("code");
      if (!code) return "";
      const cls = code.getAttribute("class") || "";
      const langMatch = cls.match(/language-([\w-]+)/);
      const lang = langMatch ? langMatch[1] : "";
      const text = code.textContent || "";
      return `\n\n\`\`\`${lang}\n${text.replace(/\n+$/, "")}\n\`\`\`\n\n`;
    },
  });

  td.addRule("dropEmpty", {
    filter: (node) => {
      if (node.nodeName !== "P" && node.nodeName !== "DIV" && node.nodeName !== "SPAN") return false;
      return !(node.textContent || "").trim() && !node.querySelector("img");
    },
    replacement: () => "",
  });

  td.addRule("imageWithAlt", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const src = el.getAttribute("src") || "";
      const alt = (el.getAttribute("alt") || "").replace(/[\[\]]/g, "");
      if (!src) return "";
      return `![${alt}](${src})`;
    },
  });

  return td;
}

function postProcess(md: string): string {
  return md
    .replace(/^﻿/, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}
