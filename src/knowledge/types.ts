import type { ClusterPageInput } from "./cluster.ts";

export interface LoadedPage extends ClusterPageInput {
  description?: string;
  /** Original SEO title when `title` had the site-wide suffix stripped. */
  fullTitle?: string;
  raw: string;
  cleanedMarkdown: string;
  diagnostics: PageDiagnostics;
  duplicate?: DuplicateInfo;
}

export interface DuplicateInfo {
  canonicalSlug: string;
  duplicateOf?: string;
  duplicateConfidence: number;
  isDuplicate: boolean;
}

export interface DuplicateGroup {
  canonicalSlug: string;
  duplicates: { slug: string; url: string; duplicateConfidence: number }[];
}

export interface PageDiagnostics {
  contentConfidence: number;
  templateConfidence?: number;
  warnings: string[];
  removedLayoutArtifacts: string[];
  removedLineCount: number;
  rawChars: number;
  cleanedChars: number;
  normalizedBodyHash: string;
}
