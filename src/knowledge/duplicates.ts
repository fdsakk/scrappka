import { normalizeBodyText } from "./clean.ts";
import { pageFingerprint } from "./cluster.ts";
import type { DuplicateGroup, LoadedPage } from "./types.ts";

const MAX_NEAR_DUPLICATE_CANDIDATES = 200;

/**
 * Marks near-identical pages (≥0.94 3-word-shingle Jaccard on normalized body
 * text) as duplicates of the first-seen canonical page. Mutates each page's
 * `duplicate` info and returns the groups for reporting.
 */
export function markDuplicates(pages: LoadedPage[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();
  const pagesBySlug = new Map(pages.map((page) => [page.slug, page]));
  const normalized = pages.map((page) => {
    const text = normalizeBodyText(page.cleanedMarkdown);
    return {
      page,
      text,
      shingles: wordShingles(text),
      fingerprint: pageFingerprint(page),
      lengthBucket: text.length > 0 ? Math.floor(Math.log(text.length) / Math.log(1.1)) : 0,
    };
  });
  for (const { page } of normalized) {
    page.duplicate = { canonicalSlug: page.slug, duplicateConfidence: 1, isDuplicate: false };
  }

  const exact = new Map<string, number>();
  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (current.text.length < 50) continue;
    const canonicalIndex = exact.get(current.text);
    if (canonicalIndex == null) exact.set(current.text, i);
    else markDuplicate(normalized[canonicalIndex].page, current.page, 1, groups, pagesBySlug);
  }

  const buckets = new Map<string, number[]>();
  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (current.page.duplicate?.isDuplicate || current.text.length < 50) continue;
    const key = `${current.fingerprint}:${current.lengthBucket}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(i);
    buckets.set(key, bucket);
  }

  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (current.page.duplicate?.isDuplicate || current.text.length < 50) continue;
    const candidateIndexes: number[] = [];
    for (let offset = -2; offset <= 2; offset += 1) {
      const key = `${current.fingerprint}:${current.lengthBucket + offset}`;
      for (const candidateIndex of buckets.get(key) ?? []) {
        if (candidateIndex > i) candidateIndexes.push(candidateIndex);
        if (candidateIndexes.length >= MAX_NEAR_DUPLICATE_CANDIDATES) break;
      }
      if (candidateIndexes.length >= MAX_NEAR_DUPLICATE_CANDIDATES) break;
    }
    for (const j of candidateIndexes) {
      const candidate = normalized[j];
      if (candidate.page.duplicate?.isDuplicate) continue;
      const confidence = duplicateConfidence(current, candidate);
      if (confidence < 0.94) continue;
      markDuplicate(current.page, candidate.page, confidence, groups, pagesBySlug);
    }
  }
  return [...groups.values()];
}

function duplicateConfidence(
  a: { text: string; shingles: Set<string> },
  b: { text: string; shingles: Set<string> },
): number {
  if (a.text === b.text) return 1;
  const lengthRatio = Math.min(a.text.length, b.text.length) / Math.max(a.text.length, b.text.length);
  if (lengthRatio < 0.82) return 0;
  let overlap = 0;
  for (const item of a.shingles) if (b.shingles.has(item)) overlap += 1;
  const union = a.shingles.size + b.shingles.size - overlap || 1;
  return Number((overlap / union).toFixed(2));
}

function markDuplicate(
  canonical: LoadedPage,
  candidate: LoadedPage,
  confidence: number,
  groups: Map<string, DuplicateGroup>,
  pagesBySlug: Map<string, LoadedPage>,
): void {
  candidate.duplicate = {
    canonicalSlug: canonical.slug,
    duplicateOf: canonical.slug,
    duplicateConfidence: confidence,
    isDuplicate: true,
  };
  if (!candidate.diagnostics.warnings.includes("duplicate_page")) {
    candidate.diagnostics.warnings.push("duplicate_page");
  }
  const group = groups.get(canonical.slug) ?? { canonicalSlug: canonical.slug, duplicates: [] };
  group.duplicates.push({ slug: candidate.slug, url: candidate.url, duplicateConfidence: confidence });
  const childGroup = groups.get(candidate.slug);
  if (childGroup) {
    for (const child of childGroup.duplicates) {
      const childPage = pagesBySlug.get(child.slug);
      if (childPage) {
        childPage.duplicate = {
          canonicalSlug: canonical.slug,
          duplicateOf: canonical.slug,
          duplicateConfidence: child.duplicateConfidence,
          isDuplicate: true,
        };
      }
      group.duplicates.push(child);
    }
    groups.delete(candidate.slug);
  }
  groups.set(canonical.slug, group);
}

function wordShingles(text: string): Set<string> {
  const words = text.split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < Math.max(1, words.length - 2); i += 1) {
    out.add(words.slice(i, i + 3).join(" "));
  }
  return out;
}

/** Cluster member slugs plus any pages marked duplicate of one of them. */
export function withDuplicateSlugs(slugs: string[], pages: LoadedPage[]): string[] {
  const out = [...slugs];
  const canonical = new Set(slugs);
  for (const page of pages) {
    if (page.duplicate?.isDuplicate && page.duplicate.duplicateOf && canonical.has(page.duplicate.duplicateOf)) {
      out.push(page.slug);
    }
  }
  return out;
}
