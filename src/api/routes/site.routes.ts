import { Hono } from "hono";

import { getScrapeJobSummary, resolveJobPath } from "../../repositories/storage.ts";
import {
  cancelMapping,
  recoverStaleScrapes,
  remapSite,
  ScrapeAlreadyActiveError,
  startMapping,
  startScrapeSelectedPages,
} from "../../scraper/crawler.ts";
import { assertPublicUrl, BlockedUrlError } from "../../scraper/ssrf-guard.ts";
import {
  createProjectStatusStream,
  NoKnowledgeError,
  prepareKnowledgeExport,
} from "../../services/site.service.ts";
import { isValidUrl, parseScrapeInput, parseStartMapInput } from "../schemas/site.schemas.ts";

export const siteRoutes = new Hono();

siteRoutes.post("/map", async (c) => {
  const input = parseStartMapInput(await readJsonBody(c));
  if (!isValidUrl(input.url)) return c.json({ error: "Invalid URL" }, 400);

  try {
    await assertPublicUrl(input.url);
  } catch (err) {
    if (err instanceof BlockedUrlError) return c.json({ error: err.message }, 400);
    return c.json({ error: errorMessage(err) }, 400);
  }

  try {
    const job = await startMapping(input.url, {
      limit: input.limit,
      includeSubdomains: input.includeSubdomains,
    });
    return c.json({ id: job.id, host: job.host, timestamp: job.timestamp });
  } catch (err) {
    return c.json({ error: errorMessage(err) }, 500);
  }
});

siteRoutes.post("/:host/:timestamp/map/cancel", async (c) => {
  const jobId = jobIdFromParams(c);
  const job = await getScrapeJobSummary(jobId);
  if (!job) return c.json({ error: "Project not found" }, 404);

  const cancelled = await cancelMapping(jobId);
  return c.json({ cancelled });
});

siteRoutes.post("/:host/:timestamp/scrape", async (c) => {
  const jobId = jobIdFromParams(c);
  const input = parseScrapeInput(await readJsonBody(c));
  if (input.slugs.length === 0) return c.json({ error: "No slugs provided" }, 400);

  const job = await getScrapeJobSummary(jobId);
  if (!job) return c.json({ error: "Project not found" }, 404);

  const unknown = input.slugs.filter((slug) => !job.pages[slug]);
  if (unknown.length > 0) return c.json({ error: `Unknown slugs: ${unknown.join(", ")}` }, 400);

  try {
    await startScrapeSelectedPages(jobId, input.slugs, job.pages);
  } catch (err) {
    if (err instanceof ScrapeAlreadyActiveError) return c.json({ error: err.message }, 409);
    return c.json({ error: errorMessage(err) }, 500);
  }
  return c.json({ accepted: true, slugs: input.slugs });
});

siteRoutes.post("/:host/:timestamp/map/again", async (c) => {
  const jobId = jobIdFromParams(c);
  const job = await getScrapeJobSummary(jobId);
  if (!job) return c.json({ error: "Project not found" }, 404);

  const started = await remapSite(jobId);
  return c.json({ started });
});

siteRoutes.get("/:host/:timestamp/stream", async (c) => {
  const jobId = jobIdFromParams(c);
  let initial = await getScrapeJobSummary(jobId);
  if (!initial) return c.json({ error: "Project not found" }, 404);
  if (hasScrapingPages(initial.pages)) {
    await recoverStaleScrapes(jobId);
    initial = (await getScrapeJobSummary(jobId)) ?? initial;
  }

  return new Response(createProjectStatusStream(jobId, initial, c.req.raw.signal), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});

siteRoutes.get("/:host/:timestamp/knowledge/zip", async (c) => {
  const jobId = jobIdFromParams(c);
  const job = await getScrapeJobSummary(jobId);
  if (!job) return c.json({ error: "Project not found" }, 404);

  let zipPaths: string[];
  try {
    zipPaths = await prepareKnowledgeExport(jobId, job);
  } catch (err) {
    if (err instanceof NoKnowledgeError) return c.json({ error: err.message }, 400);
    return c.json({ error: errorMessage(err) }, 500);
  }

  const jobDir = resolveJobPath(jobId, "");
  const filename = `knowledge-${c.req.param("host")}-${c.req.param("timestamp")}.zip`;
  const proc = Bun.spawn(["zip", "-r", "-q", "-", ...zipPaths], {
    cwd: jobDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  void proc.exited.then(async (code) => {
    if (code === 0) return;
    const stderr = await new Response(proc.stderr).text().catch(() => "");
    console.error(`[knowledge-zip] ${jobId} exited with ${code}: ${stderr.slice(0, 300)}`);
  });

  return new Response(proc.stdout, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

async function readJsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const json = await c.req.json().catch(() => ({}));
  return json && typeof json === "object" ? (json as Record<string, unknown>) : {};
}

function jobIdFromParams(c: { req: { param: (name: string) => string } }): string {
  return `${c.req.param("host")}/${c.req.param("timestamp")}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hasScrapingPages(pages: Record<string, { status: string }>): boolean {
  return Object.values(pages).some((page) => page.status === "scraping");
}
