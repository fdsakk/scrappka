import type { PageStructure } from "../scraper/html-to-md.ts";

/** Minimum pages sharing a fingerprint before they form a template cluster. */
const MIN_CLUSTER_SIZE = 4;
const FINGERPRINT_HEADING_COUNT = 12;

export type ClusterLabel =
  | "product"
  | "category"
  | "article"
  | "service"
  | "case_study"
  | "contact"
  | "regional_directory"
  | "utility"
  | "template";

export interface ClusterPageInput {
  slug: string;
  url: string;
  title?: string;
  structure?: PageStructure;
  cleanedMarkdown?: string;
  ignoredLayoutArtifacts?: string[];
  extractionWarnings?: string[];
}

export interface PageCluster {
  id: string;
  label: ClusterLabel;
  pageType: string;
  confidence: number;
  fingerprint: string;
  slugs: string[];
  /** Sample of member URLs (up to 5) for humans and LLM prompts. */
  sampleUrls: string[];
  dataSourcePath: string;
  expectedCmsFields: string[];
  missingWeakFields: string[];
  ignoredLayoutArtifacts: string[];
}

export interface ClusterResult {
  clusters: PageCluster[];
  /** Slugs that did not fall into any cluster — unique pages. */
  uniqueSlugs: string[];
}

/**
 * Structural fingerprint: pages rendered by the same template share heading
 * shape, form count and commerce signals even when their URLs look unrelated
 * (e.g. `/kategoria-x/produkt-y`). URL is intentionally not part of the key.
 */
export function pageFingerprint(page: ClusterPageInput): string {
  const s = page.structure;
  const headings = cleanedHeadingsFor(page);
  const headingShape = headings
    .slice(0, FINGERPRINT_HEADING_COUNT)
    .map((h) => (h.level === 1 ? "h1:title" : `h${h.level}:${headingBucket(h.text)}`))
    .join(",");
  const signals = s?.signals;
  const flags = [
    signals?.product ? "P" : "",
    signals?.hasCartButton ? "C" : "",
    signals?.hasPrice ? "$" : "",
    signals?.ogType === "product" ? "og" : "",
    inferPageType(page) !== "template" ? inferPageType(page).slice(0, 3) : "",
  ]
    .filter(Boolean)
    .join("");
  const forms = s?.forms?.length ?? 0;
  return `${headingShape}|f${forms}|${flags}`;
}

export function isProductPage(page: ClusterPageInput): boolean {
  const signals = page.structure?.signals;
  if (!signals) return false;
  if (signals.product) return true;
  if (signals.ogType === "product") return true;
  return signals.hasCartButton && signals.hasPrice;
}

/**
 * Groups pages into template clusters. Product pages (structured-data or
 * commerce signals) cluster together regardless of heading shape variance;
 * remaining pages cluster by structural fingerprint with a minimum size.
 */
export function clusterPages(pages: ClusterPageInput[]): ClusterResult {
  const clusters: PageCluster[] = [];
  const uniqueSlugs: string[] = [];

  const byFingerprint = new Map<string, ClusterPageInput[]>();
  for (const page of pages) {
    const fp = pageFingerprint(page);
    const group = byFingerprint.get(fp);
    if (group) group.push(page);
    else byFingerprint.set(fp, [page]);
  }

  let templateIndex = 0;
  for (const [fp, group] of byFingerprint) {
    const minimumSize = group.every(isProductPage) ? 2 : MIN_CLUSTER_SIZE;
    // A fingerprint with no headings carries no template evidence.
    if (group.length >= minimumSize && fp.split("|")[0].length > 0) {
      templateIndex += 1;
      const label = inferClusterLabel(group);
      clusters.push(makeCluster(`${label}-${templateIndex}`, label, fp, group));
    } else {
      uniqueSlugs.push(...group.map((p) => p.slug));
    }
  }

  clusters.sort((a, b) => b.slugs.length - a.slugs.length);
  return { clusters, uniqueSlugs };
}

function makeCluster(
  id: string,
  label: ClusterLabel,
  fingerprint: string,
  pages: ClusterPageInput[],
): PageCluster {
  const confidence = clusterConfidence(label, pages);
  return {
    id,
    label,
    pageType: pageTypeName(label),
    confidence,
    fingerprint,
    slugs: pages.map((p) => p.slug),
    sampleUrls: pages.slice(0, 5).map((p) => p.url),
    dataSourcePath: `knowledge/data/${id}.jsonl`,
    expectedCmsFields: expectedCmsFieldsFor(label),
    missingWeakFields: missingWeakFieldsFor(label, pages),
    ignoredLayoutArtifacts: [...new Set(pages.flatMap((p) => p.ignoredLayoutArtifacts ?? []))].slice(0, 16),
  };
}

// URL-path vocabulary (PL/EN/DE) used to vote a cluster's page type.
const ARTICLE_PATH_HINT =
  /\/(blog|aktualnosci|artykul|artykuly|news|poradnik|wpis|articles?|posts?|aktuelles|beitrag|beitraege|ratgeber)\//i;
const CATEGORY_PATH_HINT =
  /\/(kategoria|category|categories|kategorien?|produkty|produkt-category|products?|produkte|collections?|sklep|shop|oferta)\//i;
const SERVICE_PATH_HINT = /\/(uslugi|services?|oferta|leistungen|dienstleistungen|angebot)\//i;
const CASE_PATH_HINT = /\/(realizacje|realizacja|case-stud|portfolio|referencje|referenzen|projekte|projects)\//i;
const CONTACT_PATH_HINT = /\/(kontakt|contact)\b/i;
const REGIONAL_PATH_HINT = /\/(miasta|region|wojewodztwa|lokalizacje|oddzialy|locations|standorte|filialen|branches)\//i;
const UTILITY_PATH_HINT =
  /\/(dostawa|platnosci|payment|shipping|delivery|regulamin|polityka|privacy|terms|zwroty|returns|faq|impressum|datenschutz|agb|versand|zahlung|widerruf)\b/i;
const LAYOUT_HEADING_RE =
  /^(home|menu|produkty|produkt|products?|produkte|kontakt|contact|o nas|about(?: us)?|über uns|sklep|shop|koszyk|cart|warenkorb|konto|account|login|logowanie|anmelden|szukaj|search|suche|wyszukiwarka|polecane produkty|popularne|featured products|popular|kategorie[n]?|category|categories)$/i;

function looksLikeArticleCluster(pages: ClusterPageInput[]): boolean {
  const hits = pages.filter(
    (p) => ARTICLE_PATH_HINT.test(p.url) || p.structure?.signals?.ogType === "article",
  ).length;
  return hits >= Math.ceil(pages.length / 2);
}

const TECH_SPEC_HEADING_RE =
  /(specyfikacja|dane techniczne|parametry|wymiary|specifications?|technical data|technische daten|abmessungen)/i;

/**
 * Catalog sites without a shop (no prices, no cart, no product JSON-LD) still
 * template their item pages around a technical-spec section. A cluster where
 * most pages carry such a heading is a product catalog, not a generic
 * "template".
 */
function looksLikeCatalogCluster(pages: ClusterPageInput[]): boolean {
  const hits = pages.filter((p) =>
    cleanedHeadingsFor(p).some((h) => TECH_SPEC_HEADING_RE.test(h.text)),
  ).length;
  return hits >= Math.ceil(pages.length * 0.6);
}

function inferClusterLabel(pages: ClusterPageInput[]): ClusterLabel {
  const votes = new Map<ClusterLabel, number>();
  for (const page of pages) votes.set(inferPageType(page), (votes.get(inferPageType(page)) ?? 0) + 1);
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[0] ?? "template";
  if (top === "article" || looksLikeArticleCluster(pages)) return "article";
  if ((top === "template" || top === "category") && looksLikeCatalogCluster(pages)) return "product";
  return top;
}

function inferPageType(page: ClusterPageInput): ClusterLabel {
  if (isProductPage(page)) return "product";
  const url = page.url;
  const text = `${page.title ?? ""}\n${page.cleanedMarkdown ?? ""}`.slice(0, 20_000);
  if (CONTACT_PATH_HINT.test(url) || /\b(NIP|REGON|KRS|tel\.?|telefon|e-mail|email)[:\s]/i.test(text)) return "contact";
  if (ARTICLE_PATH_HINT.test(url) || page.structure?.signals?.ogType === "article") return "article";
  if (CASE_PATH_HINT.test(url)) return "case_study";
  if (REGIONAL_PATH_HINT.test(url)) return "regional_directory";
  if (UTILITY_PATH_HINT.test(url)) return "utility";
  if (CATEGORY_PATH_HINT.test(url) || /\b(sortuj|filtruj|kategorie|produkty w kategorii|sort by|filter by|sortieren|filtern)\b/i.test(text)) return "category";
  if (SERVICE_PATH_HINT.test(url)) return "service";
  return "template";
}

function cleanedHeadingsFor(page: ClusterPageInput): { level: number; text: string }[] {
  if (page.cleanedMarkdown) {
    const fromMd = page.cleanedMarkdown
      .split(/\r?\n/)
      .map((line) => line.match(/^(#{1,3})\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => m != null)
      .map((m) => ({ level: m[1].length, text: m[2].replace(/\s+/g, " ").trim() }))
      .filter((h) => h.text && !LAYOUT_HEADING_RE.test(h.text));
    if (fromMd.length > 0) return fromMd;
  }
  return (page.structure?.headings ?? []).filter((h) => h.text && !LAYOUT_HEADING_RE.test(h.text));
}

function headingBucket(text: string): string {
  const normalized = text.toLowerCase().replace(/[^a-ząćęłńóśźżäöüß0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "empty";
  if (/(opis|description|o produkcie|beschreibung)/i.test(normalized)) return "description";
  if (/(specyfikacja|dane techniczne|parametry|wymiary|specifications?|technical data|technische daten|abmessungen)/i.test(normalized)) return "technical";
  if (/(kontakt|contact|formularz|adres|address|adresse|anfahrt)/i.test(normalized)) return "contact";
  if (/(realizacje|galeria|gallery|galerie|zdjęcia|photos|portfolio|referenzen)/i.test(normalized)) return "gallery";
  if (/(aktualności|blog|poradnik|artykuły|news|articles|aktuelles|ratgeber)/i.test(normalized)) return "article-list";
  return normalized.split(" ").slice(0, 3).join("-");
}

function clusterConfidence(label: ClusterLabel, pages: ClusterPageInput[]): number {
  if (label === "product") return 0.92;
  const sameType = pages.filter((p) => inferPageType(p) === label).length / Math.max(1, pages.length);
  const hasCleanContent = pages.filter((p) => (p.cleanedMarkdown ?? "").replace(/\s+/g, " ").length > 200).length / Math.max(1, pages.length);
  return Number(Math.min(0.95, 0.55 + sameType * 0.25 + hasCleanContent * 0.15).toFixed(2));
}

function pageTypeName(label: ClusterLabel): string {
  return label.replace(/_/g, " ");
}

function expectedCmsFieldsFor(label: ClusterLabel): string[] {
  switch (label) {
    case "product":
      return ["slug", "sourceUrl", "title", "metaDescription", "productName", "categoryPath", "sku", "images", "shortDescription", "featureBullets", "technicalData", "ctaLinks", "relatedProducts"];
    case "article":
    case "case_study":
      return ["slug", "sourceUrl", "title", "date", "author", "leadImage", "headings", "bodyContent", "internalLinks", "relatedProducts"];
    case "contact":
      return ["slug", "sourceUrl", "companyName", "address", "taxIds", "phone", "email", "bankAccount", "openingHours"];
    case "category":
      return ["slug", "sourceUrl", "title", "metaDescription", "categoryPath", "intro", "items", "filters"];
    case "utility":
      return ["slug", "sourceUrl", "title", "bodyContent", "headings", "internalLinks"];
    default:
      return ["slug", "sourceUrl", "title", "metaDescription", "headings", "bodyContent", "internalLinks"];
  }
}

function missingWeakFieldsFor(label: ClusterLabel, pages: ClusterPageInput[]): string[] {
  const missing = new Set<string>();
  if (label === "product") {
    if (pages.some((p) => !p.structure?.signals?.product?.sku)) missing.add("sku");
    if (pages.some((p) => !p.structure?.signals?.product?.images?.length)) missing.add("images");
    if (pages.some((p) => !p.structure?.signals?.product?.category)) missing.add("categoryPath");
  }
  if (label === "article" || label === "case_study") {
    missing.add("date");
    missing.add("author");
  }
  if (pages.some((p) => p.extractionWarnings?.includes("mostly_navigation_content"))) {
    missing.add("bodyContent");
  }
  return [...missing];
}
