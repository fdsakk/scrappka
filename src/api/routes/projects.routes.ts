import { Hono } from "hono";

import {
  deleteScrapeJob,
  getScrapeJobSummary,
  listScrapeJobs,
} from "../../repositories/storage.ts";
import { recoverStaleScrapes } from "../../scraper/crawler.ts";

export const projectsRoutes = new Hono();

projectsRoutes.get("/projects", async (c) => {
  const projects = await listScrapeJobs();
  return c.json({ projects });
});

projectsRoutes.get("/projects/:host/:timestamp", async (c) => {
  const jobId = jobIdFromParams(c);
  let project = await getScrapeJobSummary(jobId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (hasScrapingPages(project.pages)) {
    await recoverStaleScrapes(jobId);
    project = (await getScrapeJobSummary(jobId)) ?? project;
  }
  return c.json({ project });
});

projectsRoutes.delete("/projects/:host/:timestamp", async (c) => {
  try {
    const ok = await deleteScrapeJob(jobIdFromParams(c));
    if (!ok) return c.json({ error: "Project not found" }, 404);
    return c.json({ deleted: true });
  } catch (err) {
    return c.json({ error: errorMessage(err) }, 400);
  }
});

function jobIdFromParams(c: { req: { param: (name: string) => string } }): string {
  return `${c.req.param("host")}/${c.req.param("timestamp")}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hasScrapingPages(pages: Record<string, { status: string }>): boolean {
  return Object.values(pages).some((page) => page.status === "scraping");
}
