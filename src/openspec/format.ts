export const OPENSPEC_CHANGE_ID = "rebuild-scraped-site" as const;
export const OPENSPEC_TARGET_PATH = `openspec/changes/${OPENSPEC_CHANGE_ID}` as const;

export const OPENSPEC_FILES = {
  proposal: `${OPENSPEC_TARGET_PATH}/proposal.md`,
  design: `${OPENSPEC_TARGET_PATH}/design.md`,
  tasks: `${OPENSPEC_TARGET_PATH}/tasks.md`,
  deltaSpec: `${OPENSPEC_TARGET_PATH}/specs/site-rebuild/spec.md`,
} as const;

/**
 * OpenSpec package format rules embedded in the exported PROMPT.md. Single
 * source of truth — the OpenSpec validator depends on this exact shape.
 */
export function openSpecFormatRules(): string {
  return `- The spec is for a new implementation of the website/application, not an encyclopedic company profile.
- Do not invent features, numeric facts, offers, prices, processes, integrations, or business claims not visible in the scraped content.
- Describe user-visible behavior and product requirements in the delta spec.
- Put technical decisions and neutral implementation assumptions in design.md, not in spec.md.
- Requirements should cover information architecture, content, calls to action, forms/contact, SEO/content, responsive behavior, accessibility, and visual consistency with the observed brand profile where evidence exists.
- proposal.md sections: "## Why" (50-1000 chars), "## What Changes", "## Capabilities" with "### New Capabilities" listing "- \`site-rebuild\`: ..." (and "### Modified Capabilities" = None), "## Impact".
- design.md sections: "## Context", "## Goals / Non-Goals", "## Decisions", "## Risks / Trade-offs", "## Open Questions".
- tasks.md must use numbered group headings ("## 1. Group name") and checkbox tasks ("- [ ] 1.1 Description"); the OpenSpec apply phase tracks progress only via this checkbox format.
- The delta spec must contain "## ADDED Requirements", one or more "### Requirement: ..." sections using SHALL or MUST (never should/may in normative text, requirement text under ~500 chars), each with at least one "#### Scenario: ..." (exactly 4 hashtags) whose bullets use bold markers: "- **WHEN** ...", "- **THEN** ...", optionally "- **AND** ...".
- Use OpenSpec folder semantics: proposal.md captures why/what, design.md captures how, tasks.md captures checklist work, and specs/site-rebuild/spec.md is a delta spec.`;
}
