import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cancelMapping, recoverStaleScrapes, startScrapeSelectedPages } from "./crawler.ts";
import {
  appendPages,
  createJob,
  finalizeMapping,
  getScrapeJobSummary,
  reopenMapping,
  updatePageStatus,
} from "../repositories/storage.ts";

let dir: string;
let previousScrapedDir: string | undefined;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "remap-again-test-"));
  previousScrapedDir = process.env.SCRAPED_DIR;
  process.env.SCRAPED_DIR = dir;
});

afterAll(async () => {
  if (previousScrapedDir === undefined) delete process.env.SCRAPED_DIR;
  else process.env.SCRAPED_DIR = previousScrapedDir;
  await rm(dir, { recursive: true, force: true });
});

test("reopenMapping flips a terminal job back to mapping without touching pages", async () => {
  const job = await createJob("https://example.com");
  await appendPages(job.id, [
    { url: "https://example.com/a", kind: "content" },
    { url: "https://example.com/b", kind: "content" },
  ]);
  await updatePageStatus(job.id, "a", { status: "done", contentHash: "h" });
  await updatePageStatus(job.id, "b", { status: "failed", error: "boom" });
  await finalizeMapping(job.id, { status: "mapped" });

  const source = await reopenMapping(job.id);
  expect(source).toBe("https://example.com");

  const summary = await getScrapeJobSummary(job.id);
  expect(summary?.mapping.status).toBe("mapping");
  expect(summary?.mapping.finishedAt).toBeUndefined();
  // Existing scraped/failed work is untouched by re-opening.
  expect(summary?.pages.a.status).toBe("done");
  expect(summary?.pages.b.status).toBe("failed");
});

test("reopenMapping is a no-op while a mapping is already running", async () => {
  const job = await createJob("https://running.example");
  // createJob leaves the job in `mapping` status.
  const source = await reopenMapping(job.id);
  expect(source).toBeNull();
});

test("cancelMapping finalizes a mapping job even without a live worker", async () => {
  const job = await createJob("https://stale.example");
  await appendPages(job.id, [{ url: "https://stale.example/a", kind: "content" }]);

  await expect(cancelMapping(job.id)).resolves.toBe(true);

  const summary = await getScrapeJobSummary(job.id);
  expect(summary?.mapping.status).toBe("cancelled");
  expect(summary?.mapping.finishedAt).toBeDefined();
  expect(summary?.pages.a.status).toBe("pending");
});

test("recoverStaleScrapes marks orphaned scraping pages as failed", async () => {
  const job = await createJob("https://stale-scrape.example");
  await appendPages(job.id, [{ url: "https://stale-scrape.example/a", kind: "content" }]);
  await updatePageStatus(job.id, "a", { status: "scraping" });

  await expect(recoverStaleScrapes(job.id)).resolves.toBe(1);

  const summary = await getScrapeJobSummary(job.id);
  expect(summary?.pages.a.status).toBe("failed");
  expect(summary?.pages.a.error).toContain("Scrape przerwany");
});

test("appendPages after reopen adds only new URLs, dedupes existing", async () => {
  const job = await createJob("https://dedupe.example");
  await appendPages(job.id, [{ url: "https://dedupe.example/x", kind: "content" }]);
  await updatePageStatus(job.id, "x", { status: "done", contentHash: "h" });
  await finalizeMapping(job.id, { status: "mapped" });

  await reopenMapping(job.id);
  // Re-crawl reports the known URL plus a fresh one.
  await appendPages(job.id, [
    { url: "https://dedupe.example/x", kind: "content" },
    { url: "https://dedupe.example/y", kind: "content" },
  ]);

  const summary = await getScrapeJobSummary(job.id);
  const urls = Object.values(summary?.pages ?? {}).map((p) => p.url).sort();
  expect(urls).toEqual(["https://dedupe.example/x", "https://dedupe.example/y"]);
  // The known page kept its scraped status — not reset to pending.
  expect(summary?.pages.x.status).toBe("done");
});

test("scrape batch is persisted before returning and finishes in the background", async () => {
  const originalFetch = globalThis.fetch;
  let releaseFetch: (() => void) | undefined;
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      releaseFetch = () =>
        resolve(
          new Response("<main><h1>Example</h1><p>Enough useful content for the scraper output.</p></main>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
        );
    })) as unknown as typeof fetch;

  try {
    const job = await createJob("https://93.184.216.34");
    await appendPages(job.id, [{ url: "https://93.184.216.34/a", kind: "content" }]);
    await finalizeMapping(job.id, { status: "mapped" });
    const before = await getScrapeJobSummary(job.id);
    if (!before) throw new Error("missing test job");

    await startScrapeSelectedPages(job.id, ["a"], before.pages);
    expect((await getScrapeJobSummary(job.id))?.pages.a.status).toBe("scraping");

    releaseFetch?.();
    let status = "scraping";
    for (let attempt = 0; attempt < 50 && status === "scraping"; attempt += 1) {
      await Bun.sleep(5);
      status = (await getScrapeJobSummary(job.id))?.pages.a.status ?? "missing";
    }
    expect(status).toBe("done");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
