import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.NODE_ENV = "test";

const { app } = await import("../index.ts");

describe("API", () => {
  beforeEach(async () => {
    process.env.SCRAPED_DIR = await mkdtemp(join(tmpdir(), "web-scraper-api-"));
  });

  test("health check responds ok", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("knowledge zip returns 404 for an unknown project", async () => {
    const response = await app.request("/api/app/site/example.com/1/knowledge/zip");
    expect(response.status).toBe(404);
  });

  test("knowledge zip returns 400 when the project has no scraped pages", async () => {
    await writeMetadata("example.com/2", { pages: {} });
    const response = await app.request("/api/app/site/example.com/2/knowledge/zip");
    expect(response.status).toBe(400);
  });
});

async function writeMetadata(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const path = join(process.env.SCRAPED_DIR ?? "", jobId, "metadata.json");
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({
      source: "https://example.com/",
      sourceKey: "https://example.com/",
      createdAt: "2026-05-13T10:00:00.000Z",
      mapping: {
        status: "mapped",
        startedAt: "2026-05-13T10:00:00.000Z",
        finishedAt: "2026-05-13T10:00:01.000Z",
        discovered: 0,
      },
      pages: {},
      ...patch,
    }),
  );
}
