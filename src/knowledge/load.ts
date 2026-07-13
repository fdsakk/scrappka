import { readPageFile, type JobSummary } from "../repositories/storage.ts";
import type { PageStructure } from "../scraper/html-to-md.ts";
import { emptyDiagnostics } from "./clean.ts";
import type { LoadedPage } from "./types.ts";

/** Loads every scraped (done/skipped) page's raw markdown + meta.json into memory. */
export async function loadScrapedPages(job: JobSummary): Promise<LoadedPage[]> {
  const out: LoadedPage[] = [];
  for (const [slug, page] of Object.entries(job.pages)) {
    if (page.status !== "done" && page.status !== "skipped") continue;
    let raw: string;
    try {
      raw = await readPageFile(job.id, slug, "raw.md");
    } catch {
      continue;
    }
    if (!raw.trim()) continue;
    const meta = await readMetaSafe(job.id, slug);
    out.push({
      slug,
      url: page.url,
      title: meta?.title,
      description: meta?.description,
      structure: meta?.structure,
      raw,
      cleanedMarkdown: raw,
      diagnostics: emptyDiagnostics(raw),
    });
  }
  return out;
}

async function readMetaSafe(
  jobId: string,
  slug: string,
): Promise<{ title?: string; description?: string; structure?: PageStructure } | null> {
  try {
    const parsed = JSON.parse(await readPageFile(jobId, slug, "meta.json")) as Record<string, unknown>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      structure:
        parsed.structure && typeof parsed.structure === "object"
          ? (parsed.structure as PageStructure)
          : undefined,
    };
  } catch {
    return null;
  }
}
