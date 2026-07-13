import { createHash } from "node:crypto";
import type { PageStructure } from "../scraper/html-to-md.ts";
import type { LoadedPage, PageDiagnostics } from "./types.ts";

export interface LayoutIndex {
  navTexts: Set<string>;
  commonLines: Set<string>;
  footerTexts: string[];
}

/**
 * Indexes layout noise shared across pages — nav link texts, footer blocks,
 * and short lines repeated on ≥40% of pages — so `cleanPageMarkdown` can
 * strip them from every page's body.
 */
export function buildLayoutIndex(pages: LoadedPage[]): LayoutIndex {
  const navTexts = new Set<string>();
  const lineCounts = new Map<string, number>();
  const footerTexts: string[] = [];

  for (const page of pages) {
    for (const link of page.structure?.nav ?? []) {
      const text = normalizeLine(link.text);
      if (text) navTexts.add(text);
    }
    if (page.structure?.footerText) footerTexts.push(page.structure.footerText);
    const seenOnPage = new Set<string>();
    for (const line of page.raw.split(/\r?\n/)) {
      const normalized = normalizeLine(line);
      if (!normalized || normalized.length > 120) continue;
      if (!looksLikeLayoutLine(line, navTexts) && !/^[-*]\s+\[[^\]]+\]\([^)]+\)$/.test(line.trim())) continue;
      seenOnPage.add(normalized);
    }
    for (const line of seenOnPage) lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
  }

  const threshold = Math.max(2, Math.ceil(pages.length * 0.4));
  const commonLines = new Set(
    [...lineCounts.entries()]
      .filter(([, count]) => count >= threshold)
      .map(([line]) => line),
  );
  return { navTexts, commonLines, footerTexts };
}

export function cleanPageMarkdown(page: LoadedPage, index: LayoutIndex): { markdown: string; diagnostics: PageDiagnostics } {
  const lines = page.raw.split(/\r?\n/);
  const kept: string[] = [];
  const artifacts = new Set<string>();
  let removedLineCount = 0;
  let skipHeadingLevel: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/\s+/g, " ").trim();
      if (skipHeadingLevel != null && level <= skipHeadingLevel) skipHeadingLevel = null;
      if (isLayoutSectionHeading(text)) {
        skipHeadingLevel = level;
        removedLineCount += 1;
        artifacts.add(`section:${text}`);
        continue;
      }
    }
    if (skipHeadingLevel != null) {
      removedLineCount += 1;
      continue;
    }

    const reason = removalReason(line, index);
    if (reason) {
      removedLineCount += 1;
      artifacts.add(reason);
      continue;
    }
    kept.push(line);
  }

  const markdown = normalizeMarkdown(kept.join("\n"));
  const normalized = normalizeBodyText(markdown);
  const warnings: string[] = [];
  const rawTextLen = normalizeBodyText(page.raw).length;
  const cleanedTextLen = normalized.length;
  const removedRatio = rawTextLen > 0 ? 1 - cleanedTextLen / rawTextLen : 0;
  let confidence = 0.94;
  if (cleanedTextLen < 160) {
    warnings.push("empty_or_short_body");
    confidence -= 0.25;
  }
  if (removedRatio > 0.55) {
    warnings.push("mostly_navigation_content");
    confidence -= 0.25;
  }
  if (removedLineCount > 0) confidence -= Math.min(0.12, removedLineCount * 0.01);
  confidence = Number(Math.max(0.2, Math.min(0.98, confidence)).toFixed(2));

  return {
    markdown,
    diagnostics: {
      contentConfidence: confidence,
      warnings,
      removedLayoutArtifacts: [...artifacts].slice(0, 40),
      removedLineCount,
      rawChars: page.raw.length,
      cleanedChars: markdown.length,
      normalizedBodyHash: hashText(normalized),
    },
  };
}

/** Rebuilds `structure.headings` from the cleaned markdown so stripped layout headings disappear. */
export function cleanedStructure(structure: PageStructure | undefined, markdown: string): PageStructure | undefined {
  if (!structure) return structure;
  const headings = markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,3})\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => m != null)
    .map((m) => ({ level: m[1].length, text: m[2].replace(/\s+/g, " ").trim() }));
  return { ...structure, headings };
}

export function emptyDiagnostics(raw: string): PageDiagnostics {
  return {
    contentConfidence: 1,
    warnings: [],
    removedLayoutArtifacts: [],
    removedLineCount: 0,
    rawChars: raw.length,
    cleanedChars: raw.length,
    normalizedBodyHash: hashText(normalizeBodyText(raw)),
  };
}

// Space on at least one side — sloppy CMS titles produce "montażu- budki";
// requiring both sides would miss them, requiring neither would split "e-mail".
const TITLE_SEPARATOR_RE = /\s+[-–—|·»]\s*|\s*[-–—|·»]\s+/g;

/**
 * SEO titles usually repeat boilerplate tails ("Kontakt - Oryginalne budki
 * dla ptaków i nietoperzy - sikorka, ..."). Finds separator-aligned suffixes
 * repeated verbatim on at least max(4, 5% of titled pages) — sites often mix
 * several tail variants per section, so a site-wide percentage would never
 * trigger — and strips the longest matching one from each title, keeping the
 * original as `fullTitle`. Language-agnostic: works on separators and
 * repetition, not vocabulary. The 12-char minimum keeps short informative
 * endings ("- 32 mm") intact.
 */
export function stripCommonTitleSuffix(pages: LoadedPage[]): void {
  const titled = pages.filter((p): p is LoadedPage & { title: string } => Boolean(p.title));
  if (titled.length < 4) return;

  const counts = new Map<string, number>();
  for (const page of titled) {
    const seenOnPage = new Set<string>();
    TITLE_SEPARATOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TITLE_SEPARATOR_RE.exec(page.title)) !== null) {
      const suffix = page.title.slice(m.index);
      if (suffix.length >= 12) seenOnPage.add(suffix);
    }
    for (const suffix of seenOnPage) counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
  }

  const threshold = Math.max(4, Math.ceil(titled.length * 0.05));
  const common = [...counts.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([suffix]) => suffix)
    .sort((a, b) => b.length - a.length);
  if (common.length === 0) return;

  for (const page of titled) {
    const suffix = common.find((s) => page.title.endsWith(s));
    if (!suffix) continue;
    const short = page.title.slice(0, -suffix.length).trim();
    if (!short) continue;
    page.fullTitle = page.title;
    page.title = short;
  }
}

function removalReason(line: string, index: LayoutIndex): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const normalized = normalizeLine(trimmed);
  if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) return "image_only";
  if (index.commonLines.has(normalized)) return `repeated:${trimmed.slice(0, 80)}`;
  if (index.navTexts.has(normalized)) return `navigation:${trimmed}`;
  if (isBreadcrumbLine(trimmed)) return "breadcrumbs";
  if (looksLikeLayoutLine(trimmed, index.navTexts)) return `layout:${trimmed.slice(0, 80)}`;
  for (const footer of index.footerTexts) {
    if (footer.includes(trimmed) && trimmed.length > 8) return "footer";
  }
  return null;
}

function isBreadcrumbLine(line: string): boolean {
  if (!/(›|»|>|\/)/.test(line)) return false;
  const linkCount = (line.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;
  return linkCount >= 2 || /home|strona główna|start|startseite/i.test(line);
}

// Site-chrome vocabulary (PL/EN/DE): single words/short phrases that are
// navigation widgets, not content, when they make up a whole line or heading.
const LAYOUT_WORD_RE =
  /^(home|menu|produkty|produkt|products?|produkte|kontakt|contact|o nas|about(?: us)?|über uns|impressum|sklep|shop|koszyk|cart|warenkorb|konto|account|login|logowanie|anmelden|szukaj|search|suche|wyszukiwarka|categories|category|kategorien?)$/i;
const LAYOUT_WIDGET_RE =
  /^(zaloguj|konto|koszyk|cart|search|szukaj|suche|newsletter|cookies?|akceptuj|accept|akzeptieren|czytaj więcej|read more|weiterlesen|mehr erfahren|learn more)$/i;

function looksLikeLayoutLine(line: string, navTexts: Set<string>): boolean {
  const trimmed = line.trim();
  const text = trimmed.replace(/^[-*]\s+/, "").replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1").trim();
  const normalized = normalizeLine(text);
  if (navTexts.has(normalized)) return true;
  if (LAYOUT_WORD_RE.test(text)) return true;
  if (LAYOUT_WIDGET_RE.test(text)) return true;
  if (/^\[[^\]]{1,40}\]\([^)]+\)$/.test(trimmed) && text.length <= 40) return true;
  return false;
}

function isLayoutSectionHeading(text: string): boolean {
  return /^(menu|kategorie[n]?|polecane produkty|popularne produkty|related products|featured products|popular products|you may also like|ähnliche produkte|beliebte produkte|zubehör|zobacz również|see also|newsletter|koszyk|cart|warenkorb|konto|account|login|wyszukiwarka|search|suche|social media|follow us|folgen sie uns)$/i.test(text.trim());
}

function normalizeLine(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>[\]().,:;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeMarkdown(markdown: string): string {
  return `${markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

/** Markdown → lowercase plain text; the input for duplicate detection and body-length checks. */
export function normalizeBodyText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>|-]+/g, " ")
    .replace(/\b(?:jpg|jpeg|png|webp|gif|svg|pdf)\b/gi, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
