import { OPENSPEC_FILES, OPENSPEC_TARGET_PATH, openSpecFormatRules } from "../openspec/format.ts";
import type { JobSummary } from "../repositories/storage.ts";
import type { KnowledgeManifest } from "./build.ts";

/**
 * Default prompt shipped inside the knowledge ZIP for running the OpenSpec
 * generation with a local agent (Claude Code, Cursor, aider, ...). Written for
 * an agent operating in the unpacked directory.
 */
export function renderAgentPrompt(job: JobSummary, manifest: KnowledgeManifest): string {
  const clusterLines = manifest.clusters.map(
    (c) =>
      `- \`${c.id}\` (${c.label}, ${c.slugs.length} pages) — template: \`knowledge/templates/${c.id}.md\`, data: \`knowledge/data/${c.id}.jsonl\``,
  );

  return `# Site rebuild — agent instructions

You are working in a knowledge base scraped from **${job.source}** (${new Date(manifest.generatedAt).toISOString().slice(0, 10)}). Your job: produce an OpenSpec change package describing a rebuild of this site, plus redacted content ready for implementation agents.

## Input layout

- \`knowledge/site.md\` — start here: page inventory, template clusters, navigation, URL tree.
- \`knowledge/templates/<id>.md\` — one file per repeated page type. These describe the cleaned body/content pattern, inferred page type, confidence, expected CMS fields, weak fields, and ignored layout artifacts. They are not full site chrome.
- \`knowledge/data/<id>.jsonl\` — one JSON record per page of that type (title, structured fields, duplicate/confidence metadata, warnings, ...). This is data, not prose — at rebuild time it feeds a CMS/collection.
${clusterLines.length > 0 ? clusterLines.join("\n") : "- (no template clusters detected — all pages are unique)"}
- \`knowledge/content/<slug>.md\` — cleaned body content of canonical unique pages (home, about, contact, ...). Treat this and \`knowledge/site.md\` as ground truth.
- \`knowledge/raw/<slug>.md\` — original scraped markdown. Use only as fallback when cleaned content has low confidence or a diagnostic warning.
- \`knowledge/diagnostics/<slug>.json\` — extraction confidence, duplicate status, removed layout artifacts, and warnings.
- \`knowledge/audit.json\` / \`knowledge/audit.md\` — quality report: low-confidence pages, duplicate groups, cluster summary, noisy sections, suspicious facts, and manual review list.
- \`knowledge/facts.jsonl\` — reliable allow-list of concrete figures (prices, measurements, %, dates/years, counts, phone/email, tax IDs, bank accounts, labeled SKUs), each with source URL and context. May be absent if no reliable facts were found.
- \`knowledge/facts-review.jsonl\` — uncertain candidates separated from the allow-list. Never reuse these values unless a human explicitly approves them. May be absent.
- \`knowledge/brand.json\` — colors/fonts/logo evidence probed from the live site (may be missing, partial, or low-confidence).

## Step 1 — Tone of voice

Read 3-5 unique pages and 2-3 records/templates per cluster. Write \`knowledge/brand.md\`:
- tone of voice: register, sentence length, person, emotional temperature — each claim backed by a short quote from the content,
- terminology: recurring product/domain vocabulary to keep, phrases to avoid,
- style rules for writing new copy in this brand (bullet list, imperative).

## Step 2 — Content redaction

For every file in \`knowledge/content/\`: treat the content as already cleaned body copy. You may fix obvious typography, but do not reintroduce navigation/header/footer/sidebar artifacts from raw files. Keep all facts, offers and numbers exactly as scraped — never invent or embellish. Preserve the file names.

**Numeric ground truth:** every price, measurement, percentage, date/year, count, contact number, business identifier, bank account, or SKU you write into content or the spec MUST appear in \`knowledge/facts.jsonl\` and match the source slug/URL. Do not introduce any figure absent from that file. Never use \`facts-review.jsonl\` without explicit human approval; otherwise leave the value out or mark it \`REQUIRES REVIEW\`.

## Step 3 — OpenSpec package

Create the change package at \`${OPENSPEC_TARGET_PATH}/\`:
- \`${OPENSPEC_FILES.proposal}\`
- \`${OPENSPEC_FILES.design}\`
- \`${OPENSPEC_FILES.tasks}\`
- \`${OPENSPEC_FILES.deltaSpec}\`

Format rules (the OpenSpec validator enforces these):

${openSpecFormatRules()}

Additional rules for this knowledge base:
- Treat \`knowledge/site.md\` and cleaned \`knowledge/content/*.md\` as ground truth for information architecture and content. Use raw files only as fallback when diagnostics show weak extraction.
- Write requirements **per template cluster** (one page type + data import from its JSONL), never per individual clustered page. Reference the \`knowledge/data/<id>.jsonl\` path in the requirement.
- Duplicate pages must not produce duplicate requirements. Use the canonical page/record and mention redirects or alternate URLs only when needed.
- Unique pages get individual requirements referencing \`knowledge/content/<slug>.md\`.
- Navigation artifacts, repeated menu headings, login/cart/search widgets, sidebars, footer blocks, breadcrumbs, global CTA strips and product carousels must not become business requirements unless explicitly represented as navigation or related-products metadata.
- Visual/brand requirements must cite \`knowledge/brand.md\` (from Step 1) and \`knowledge/brand.json\`. If \`brand.json\` has low logo confidence or warnings, treat that evidence as advisory, not definitive.
- Respect \`contentConfidence\`, \`templateConfidence\`, \`isDuplicate\`, \`canonicalSlug\`, and \`warnings\` fields in JSONL/diagnostics. Low-confidence pages and warnings listed in \`knowledge/audit.md\` need manual review notes in the OpenSpec tasks.
- Every requirement containing a concrete claim or figure must cite the corresponding knowledge path and source slug. When evidence conflicts, prefer the higher-confidence canonical page and record the conflict for review.

## Done when

- \`knowledge/brand.md\` exists with quoted evidence,
- every \`knowledge/content/*.md\` is redacted,
- the four OpenSpec files exist and \`npx openspec validate\` passes in this directory.
`;
}
