import type { JobSummary } from "../repositories/storage.ts";
import type { PageCluster } from "./cluster.ts";
import type { extractFacts } from "./facts.ts";
import type { DuplicateGroup, LoadedPage } from "./types.ts";

export function buildAudit(
  job: JobSummary,
  pages: LoadedPage[],
  clusters: PageCluster[],
  uniqueSlugs: string[],
  duplicateGroups: DuplicateGroup[],
  facts: ReturnType<typeof extractFacts>,
): Record<string, unknown> {
  const lowConfidence = pages.filter((p) => p.diagnostics.contentConfidence < 0.7);
  const mostlyNavigation = pages.filter((p) => p.diagnostics.warnings.includes("mostly_navigation_content"));
  const shortBody = pages.filter((p) => p.diagnostics.warnings.includes("empty_or_short_body"));
  const noisySectionsRemoved = pages.reduce((sum, p) => sum + p.diagnostics.removedLineCount, 0);
  const suspiciousFactsCount = facts.filter((f) => f.needsReview).length;
  const duplicatePages = duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0);
  const factsByKind: Record<string, number> = {};
  const suspiciousFactsByKind: Record<string, number> = {};
  for (const fact of facts) {
    factsByKind[fact.kind] = (factsByKind[fact.kind] ?? 0) + 1;
    if (fact.needsReview) suspiciousFactsByKind[fact.kind] = (suspiciousFactsByKind[fact.kind] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    source: job.source,
    totalPagesScraped: pages.length,
    pagesSuccessfullyClassified:
      clusters.reduce((sum, c) => sum + c.slugs.length, 0) + uniqueSlugs.length + duplicatePages,
    pagesWithLowConfidenceExtraction: lowConfidence.map((p) => pageReviewItem(p)),
    duplicateGroups,
    templateClusterSummary: clusters.map((c) => ({
      id: c.id,
      pageType: c.pageType,
      confidence: c.confidence,
      pages: c.slugs.length,
      dataSourcePath: c.dataSourcePath,
      missingWeakFields: c.missingWeakFields,
    })),
    noisySectionsRemoved,
    factsCount: facts.length,
    reliableFactsCount: facts.length - suspiciousFactsCount,
    reviewFactsCount: suspiciousFactsCount,
    factsByKind,
    suspiciousFactsCount,
    suspiciousFactsByKind,
    suspiciousBrandAssets: [],
    pagesWithMostlyNavigationLayoutContent: mostlyNavigation.map((p) => pageReviewItem(p)),
    pagesWithEmptyOrVeryShortBody: shortBody.map((p) => pageReviewItem(p)),
    recommendedManualReview: [...new Map([...lowConfidence, ...mostlyNavigation, ...shortBody].map((p) => [p.slug, pageReviewItem(p)])).values()],
  };
}

function pageReviewItem(page: LoadedPage): Record<string, unknown> {
  return {
    slug: page.slug,
    url: page.url,
    contentConfidence: page.diagnostics.contentConfidence,
    warnings: page.diagnostics.warnings,
    diagnostics: `knowledge/diagnostics/${page.slug}.json`,
  };
}

function renderKindBreakdown(value: unknown): string {
  const entries = Object.entries((value ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "";
  return ` (${entries.map(([kind, count]) => `${kind}: ${count}`).join(", ")})`;
}

export function renderAuditMarkdown(audit: Record<string, unknown>): string {
  const clusters = audit.templateClusterSummary as Array<Record<string, unknown>>;
  const duplicates = audit.duplicateGroups as DuplicateGroup[];
  const review = audit.recommendedManualReview as Array<Record<string, unknown>>;
  const lines = [
    "# Knowledge Audit",
    "",
    `- total pages scraped: ${audit.totalPagesScraped}`,
    `- pages successfully classified: ${audit.pagesSuccessfullyClassified}`,
    `- duplicate groups: ${duplicates.length}`,
    `- noisy sections removed: ${audit.noisySectionsRemoved}`,
    `- facts extracted: ${audit.factsCount}${renderKindBreakdown(audit.factsByKind)}`,
    `- suspicious facts: ${audit.suspiciousFactsCount}${renderKindBreakdown(audit.suspiciousFactsByKind)}`,
    "",
    "## Template clusters",
    "",
    "| id | type | confidence | pages | data | weak fields |",
    "|---|---|---:|---:|---|---|",
    ...clusters.map((c) => `| ${c.id} | ${c.pageType} | ${c.confidence} | ${c.pages} | ${c.dataSourcePath} | ${Array.isArray(c.missingWeakFields) && c.missingWeakFields.length ? c.missingWeakFields.join(", ") : ""} |`),
    "",
    "## Duplicate groups",
    "",
    ...(duplicates.length
      ? duplicates.flatMap((g) => [`- canonical: ${g.canonicalSlug}`, ...g.duplicates.map((d) => `  - ${d.slug} (${d.duplicateConfidence}) — ${d.url}`)])
      : ["- none detected"]),
    "",
    "## Recommended manual review",
    "",
    ...(review.length
      ? review.map((p) => `- ${p.slug} — ${p.url} (${p.contentConfidence}, ${(p.warnings as string[]).join(", ")})`)
      : ["- none"]),
  ];
  return `${lines.join("\n")}\n`;
}
