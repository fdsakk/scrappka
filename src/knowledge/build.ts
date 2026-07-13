import { rm } from "node:fs/promises";
import { resolveJobPath, writeJobFile, type JobSummary } from "../repositories/storage.ts";
import { buildAudit, renderAuditMarkdown } from "./audit.ts";
import { buildLayoutIndex, cleanPageMarkdown, cleanedStructure, stripCommonTitleSuffix } from "./clean.ts";
import { clusterPages, type PageCluster } from "./cluster.ts";
import { markDuplicates, withDuplicateSlugs } from "./duplicates.ts";
import { dedupeFacts, extractFacts } from "./facts.ts";
import { loadScrapedPages } from "./load.ts";
import { recordFor } from "./records.ts";
import { renderSiteDoc, renderTemplateDoc, renderUniquePage } from "./render.ts";
import type { DuplicateGroup, LoadedPage } from "./types.ts";

export interface KnowledgeManifest {
  generatedAt: string;
  clusters: PageCluster[];
  uniqueSlugs: string[];
  duplicateGroups: DuplicateGroup[];
  auditPath: string;
  files: string[];
}

/**
 * Distills scraped pages into a file-based knowledge base under
 * `<job>/knowledge/`: site inventory, one template doc + JSONL data file per
 * page cluster, and full content only for unique pages. Deterministic — the
 * LLM steps (tone of voice, copy redaction) consume these files later.
 */
export async function buildKnowledge(job: JobSummary): Promise<KnowledgeManifest> {
  const pages = await loadScrapedPages(job);
  stripCommonTitleSuffix(pages);
  const layoutIndex = buildLayoutIndex(pages);
  for (const page of pages) {
    const cleaned = cleanPageMarkdown(page, layoutIndex);
    page.cleanedMarkdown = cleaned.markdown;
    page.ignoredLayoutArtifacts = cleaned.diagnostics.removedLayoutArtifacts;
    page.extractionWarnings = cleaned.diagnostics.warnings;
    page.diagnostics = cleaned.diagnostics;
    page.structure = cleanedStructure(page.structure, page.cleanedMarkdown);
  }
  const duplicateGroups = markDuplicates(pages);
  const canonicalPages = pages.filter((p) => !p.duplicate?.isDuplicate);
  const { clusters, uniqueSlugs } = clusterPages(canonicalPages);
  const clusterBySlug = new Map<string, PageCluster>();
  for (const cluster of clusters) {
    for (const slug of cluster.slugs) clusterBySlug.set(slug, cluster);
  }
  for (const page of pages) {
    const canonicalSlug = page.duplicate?.canonicalSlug ?? page.slug;
    const cluster = clusterBySlug.get(canonicalSlug);
    if (cluster) page.diagnostics.templateConfidence = cluster.confidence;
  }

  // Wipe the previous run — cluster membership can change between scrapes,
  // and stale data/content files would otherwise ship in the export ZIPs.
  await rm(resolveJobPath(job.id, "knowledge"), { recursive: true, force: true });

  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const files: string[] = [];
  const write = async (path: string, content: string): Promise<void> => {
    await writeJobFile(job.id, path, content);
    files.push(path);
  };

  for (const page of pages) {
    await write(`knowledge/raw/${page.slug}.md`, page.raw);
    await write(`knowledge/diagnostics/${page.slug}.json`, `${JSON.stringify(page.diagnostics, null, 2)}\n`);
  }

  for (const cluster of clusters) {
    const members = withDuplicateSlugs(cluster.slugs, pages)
      .map((slug) => bySlug.get(slug))
      .filter((p): p is LoadedPage => p != null);
    await write(`knowledge/templates/${cluster.id}.md`, renderTemplateDoc(cluster, members));
    const lines = members.map((p) => JSON.stringify(recordFor(p, cluster)));
    await write(`knowledge/data/${cluster.id}.jsonl`, `${lines.join("\n")}\n`);
  }

  for (const slug of uniqueSlugs) {
    const page = bySlug.get(slug);
    if (!page) continue;
    await write(`knowledge/content/${slug}.md`, renderUniquePage(page));
  }

  const facts = dedupeFacts(
    pages.flatMap((p) => extractFacts({ slug: p.slug, url: p.url, raw: p.cleanedMarkdown })),
  );
  const reliableFacts = facts.filter((fact) => !fact.needsReview);
  const reviewFacts = facts.filter((fact) => fact.needsReview);
  if (reliableFacts.length > 0) {
    await write("knowledge/facts.jsonl", `${reliableFacts.map((f) => JSON.stringify(f)).join("\n")}\n`);
  }
  if (reviewFacts.length > 0) {
    await write("knowledge/facts-review.jsonl", `${reviewFacts.map((f) => JSON.stringify(f)).join("\n")}\n`);
  }

  await write("knowledge/site.md", renderSiteDoc(job, clusters, uniqueSlugs, pages, duplicateGroups));

  const audit = buildAudit(job, pages, clusters, uniqueSlugs, duplicateGroups, facts);
  const auditJsonPath = "knowledge/audit.json";
  await write(auditJsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  await write("knowledge/audit.md", renderAuditMarkdown(audit));

  return { generatedAt: new Date().toISOString(), clusters, uniqueSlugs, duplicateGroups, auditPath: auditJsonPath, files };
}
