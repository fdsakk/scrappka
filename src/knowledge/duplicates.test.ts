import { describe, expect, test } from "bun:test";
import { markDuplicates } from "./duplicates.ts";
import type { LoadedPage } from "./types.ts";

function page(slug: string, content: string): LoadedPage {
  return {
    slug,
    url: `https://example.com/${slug}`,
    raw: content,
    cleanedMarkdown: content,
    diagnostics: {
      contentConfidence: 1,
      warnings: [],
      removedLayoutArtifacts: [],
      removedLineCount: 0,
      rawChars: content.length,
      cleanedChars: content.length,
      normalizedBodyHash: slug,
    },
  };
}

describe("markDuplicates", () => {
  test("reparents an exact duplicate group when its canonical is near-duplicate", () => {
    const base = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
    const near = `${base} extra`;
    const pages = [page("a", base), page("b", near), page("c", near)];

    const groups = markDuplicates(pages);

    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalSlug).toBe("a");
    expect(groups[0].duplicates.map((item) => item.slug).sort()).toEqual(["b", "c"]);
    expect(pages[2].duplicate?.canonicalSlug).toBe("a");
  });
});
