import { buildKnowledge } from "../knowledge/build.ts";
import { renderAgentPrompt } from "../knowledge/prompt.ts";
import { pageStatusCounts } from "../scraper/crawler.ts";
import { probeBrand } from "../scraper/brand-probe.ts";
import {
  subscribeJobMetadata,
  updateJobMetadata,
  writeJobFile,
  type JobMetadata,
  type JobSummary,
  type PageStatus,
} from "../repositories/storage.ts";

export interface StreamPayload {
  mapping: JobSummary["mapping"];
  pages: JobSummary["pages"];
  counts: Record<PageStatus, number>;
}

export class NoKnowledgeError extends Error {}

/**
 * Builds a fresh knowledge base + PROMPT.md for running the OpenSpec
 * generation with a local LLM agent. Returns the paths to include in the
 * export ZIP.
 */
export async function prepareKnowledgeExport(jobId: string, job: JobSummary): Promise<string[]> {
  const manifest = await buildKnowledge(job);
  if (manifest.clusters.length === 0 && manifest.uniqueSlugs.length === 0) {
    throw new NoKnowledgeError("No scraped pages to build the knowledge base from");
  }
  await writeJobFile(jobId, "knowledge/manifest.json", JSON.stringify(manifest, null, 2));

  try {
    const brand = await probeBrand(job.source);
    await writeJobFile(jobId, "knowledge/brand.json", JSON.stringify(brand, null, 2));
  } catch {}

  await writeJobFile(jobId, "PROMPT.md", renderAgentPrompt(job, manifest));
  await updateJobMetadata(jobId, (metadata) => ({ ...metadata }));
  return ["PROMPT.md", "knowledge"];
}

export function buildStreamPayload(summary: Pick<JobSummary, "mapping" | "pages">): StreamPayload {
  return {
    mapping: summary.mapping,
    pages: summary.pages,
    counts: pageStatusCounts(summary.pages),
  };
}

export function isTerminalStreamPayload(payload: StreamPayload): boolean {
  if (payload.mapping.status === "mapping") return false;
  return (payload.counts.scraping ?? 0) === 0;
}

export function createProjectStatusStream(jobId: string, initial: JobSummary, signal: AbortSignal): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const onAbort = () => close();
      const cleanup = () => {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        signal.removeEventListener("abort", onAbort);
      };
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {}
      };

      let lastSerialized = "";
      const pushIfChanged = (metadata: JobMetadata) => {
        if (closed) return;
        const payload = buildStreamPayload(metadata);
        const serialized = JSON.stringify(payload);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          send("status", payload);
        }
        if (!isTerminalStreamPayload(payload)) return;
        send("done", {});
        close();
      };

      const initialPayload = buildStreamPayload(initial);
      lastSerialized = JSON.stringify(initialPayload);
      send("status", initialPayload);

      if (isTerminalStreamPayload(initialPayload)) {
        send("done", {});
        close();
        return;
      }

      unsubscribe = subscribeJobMetadata(jobId, pushIfChanged);
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          close();
        }
      }, 15000);
      signal.addEventListener("abort", onAbort, { once: true });
    },
  });
}
