import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.NODE_ENV = "test";

const { app } = await import("../index.ts");
const { createApp } = await import("./app.ts");

describe("API", () => {
  beforeEach(async () => {
    process.env.SCRAPED_DIR = await mkdtemp(join(tmpdir(), "web-scraper-api-"));
  });

  test("health check responds ok", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("health check stays public when basic auth is enabled", async () => {
    const previousUsername = process.env.AUTH_USERNAME;
    const previousPassword = process.env.AUTH_PASSWORD;
    process.env.AUTH_USERNAME = "health-test";
    process.env.AUTH_PASSWORD = "health-test-password";

    try {
      const securedApp = createApp();
      expect((await securedApp.request("/api/health")).status).toBe(200);
      expect((await securedApp.request("/api/app")).status).toBe(401);
    } finally {
      if (previousUsername === undefined) delete process.env.AUTH_USERNAME;
      else process.env.AUTH_USERNAME = previousUsername;
      if (previousPassword === undefined) delete process.env.AUTH_PASSWORD;
      else process.env.AUTH_PASSWORD = previousPassword;
    }
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
