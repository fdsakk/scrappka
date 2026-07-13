import { buildSiteTree } from "../openspec/site-tree.ts";
import type { JobSummary } from "../repositories/storage.ts";
import type { PageLink } from "../scraper/html-to-md.ts";
import type { PageCluster } from "./cluster.ts";
import type { DuplicateGroup, LoadedPage } from "./types.ts";

const MAX_TEMPLATE_EXCERPT_CHARS = 3_000;
const MAX_UNIQUE_CONTENT_CHARS = 40_000;

export function renderTemplateDoc(cluster: PageCluster, members: LoadedPage[]): string {
  const representative = members.reduce(
    (best, p) => (p.raw.length > (best?.raw.length ?? 0) ? p : best),
    members[0],
  );
  const lines = [
    `# Template: ${cluster.id}`,
    "",
    `- inferred page type: ${cluster.pageType}`,
    `- confidence: ${cluster.confidence}`,
    `- pages: ${cluster.slugs.length}`,
    `- data source: ${cluster.dataSourcePath}`,
    `- structural fingerprint: \`${cluster.fingerprint}\``,
    `- expected CMS fields: ${cluster.expectedCmsFields.join(", ")}`,
    `- missing/weak fields: ${cluster.missingWeakFields.length ? cluster.missingWeakFields.join(", ") : "none detected"}`,
    "",
    "## Sample URLs",
    ...cluster.sampleUrls.map((u) => `- ${u}`),
    "",
    "## Ignored Layout Artifacts",
    ...(cluster.ignoredLayoutArtifacts.length > 0 ? cluster.ignoredLayoutArtifacts.map((a) => `- ${a}`) : ["- none detected"]),
  ];
  if (representative) {
    const headings = (representative.structure?.headings ?? [])
      .map((h) => `${"#".repeat(h.level)} ${h.text}`)
      .join("\n");
    lines.push("", `## Layout (representative: ${representative.url})`, "", headings || "(no headings)");
    lines.push(
      "",
      "## Content excerpt",
      "",
      representative.cleanedMarkdown.slice(0, MAX_TEMPLATE_EXCERPT_CHARS),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderUniquePage(page: LoadedPage): string {
  const header = [
    `# ${page.title ?? page.url}`,
    "",
    `- url: ${page.url}`,
    page.description ? `- description: ${page.description}` : null,
    `- contentConfidence: ${page.diagnostics.contentConfidence}`,
    `- isDuplicate: ${page.duplicate?.isDuplicate ?? false}`,
    page.duplicate?.isDuplicate ? `- duplicateOf: ${page.duplicate.duplicateOf}` : null,
    page.diagnostics.warnings.length > 0 ? `- warnings: ${page.diagnostics.warnings.join(", ")}` : null,
    "",
    "---",
    "",
  ]
    .filter((l): l is string => l != null)
    .join("\n");
  return `${header}${page.cleanedMarkdown.slice(0, MAX_UNIQUE_CONTENT_CHARS)}\n`;
}

export function renderSiteDoc(
  job: JobSummary,
  clusters: PageCluster[],
  uniqueSlugs: string[],
  pages: LoadedPage[],
  duplicateGroups: DuplicateGroup[],
): string {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const nav = firstNav(pages);
  const lines = [
    `# Site knowledge: ${job.source}`,
    "",
    `Scraped pages: ${pages.length}. Template clusters: ${clusters.length}. Unique content pages: ${uniqueSlugs.length}. Duplicate groups: ${duplicateGroups.length}.`,
    "",
    "## Page inventory",
    "",
    "| cluster | type | confidence | pages | data |",
    "|---|---|---:|---:|---|",
    ...clusters.map(
      (c) => `| ${c.id} | ${c.pageType} | ${c.confidence} | ${c.slugs.length} | ${c.dataSourcePath} |`,
    ),
    "",
    "## Unique pages",
    "",
    ...uniqueSlugs.map((slug) => {
      const page = bySlug.get(slug);
      return `- ${page?.title ?? slug} — ${page?.url ?? ""} (knowledge/content/${slug}.md)`;
    }),
  ];
  if (duplicateGroups.length > 0) {
    lines.push("", "## Duplicate pages", "");
    for (const group of duplicateGroups) {
      lines.push(`- canonical: ${group.canonicalSlug}`);
      for (const dup of group.duplicates) {
        lines.push(`  - ${dup.slug} (${dup.duplicateConfidence}) — ${dup.url}`);
      }
    }
  }
  if (nav.length > 0) {
    lines.push("", "## Main navigation", "", ...nav.map((l) => `- [${l.text}](${l.href})`));
  }
  lines.push("", "## URL tree", "", "```", buildSiteTree(job), "```");
  return `${lines.join("\n")}\n`;
}

function firstNav(pages: LoadedPage[]): PageLink[] {
  for (const page of pages) {
    const nav = page.structure?.nav;
    if (nav && nav.length > 0) return nav;
  }
  return [];
}
