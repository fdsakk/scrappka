import { describe, expect, test } from "bun:test";
import { resolveJobPath, resolvePagePath } from "./storage.ts";

describe("storage path resolution", () => {
  test("allows nested job files but rejects escaping the job directory", () => {
    expect(resolveJobPath("example.com/1", "openspec/changes/rebuild-scraped-site/proposal.md")).toContain(
      "openspec/changes/rebuild-scraped-site/proposal.md",
    );
    expect(() => resolveJobPath("example.com/1", "../2/metadata.json")).toThrow("Invalid job path");
  });

  test("rejects page file paths escaping the page directory", () => {
    expect(resolvePagePath("example.com/1", "root", "raw.md")).toContain("pages/root/raw.md");
    expect(() => resolvePagePath("example.com/1", "root", "../../metadata.json")).toThrow("Invalid page path");
  });
});
