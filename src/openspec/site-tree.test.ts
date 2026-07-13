import { describe, expect, test } from "bun:test";
import type { JobSummary, PageMetadata } from "../repositories/storage.ts";
import { buildSiteTree } from "./site-tree.ts";

function jobWithPages(pages: Record<string, PageMetadata>): JobSummary {
  return {
    id: "example.com/t",
    source: "https://example.com/",
    sourceKey: "https://example.com/",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    files: [],
    pages,
    mapping: { status: "mapped", startedAt: "2026-01-01T00:00:00.000Z", discovered: 0 },
  };
}

describe("buildSiteTree", () => {
  test("renders nested path hierarchy", () => {
    const tree = buildSiteTree(
      jobWithPages({
        root: { url: "https://example.com/", status: "done", kind: "content" },
        a: { url: "https://example.com/docs/intro", status: "pending", kind: "content" },
        b: { url: "https://example.com/docs/api/auth", status: "pending", kind: "content" },
      }),
    );
    expect(tree.split("\n")[0]).toBe("/");
    expect(tree).toContain("  docs");
    expect(tree).toContain("    intro");
    expect(tree).toContain("      auth");
  });
});
