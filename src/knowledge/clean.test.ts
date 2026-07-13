import { describe, expect, test } from "bun:test";
import { emptyDiagnostics, stripCommonTitleSuffix } from "./clean.ts";
import type { LoadedPage } from "./types.ts";

function page(slug: string, title?: string): LoadedPage {
  return {
    slug,
    url: `https://x.pl/${slug}`,
    title,
    raw: "body",
    cleanedMarkdown: "body",
    diagnostics: emptyDiagnostics("body"),
  };
}

describe("stripCommonTitleSuffix", () => {
  const SUFFIX = " - Oryginalne budki dla ptaków i nietoperzy";

  test("strips a suffix repeated across pages and keeps the original", () => {
    const pages = [
      page("kontakt", `Kontakt${SUFFIX}`),
      page("o-firmie", `O firmie${SUFFIX}`),
      page("realizacje", `Realizacje${SUFFIX}`),
      page("cennik", `Cennik${SUFFIX}`),
      page("inna", "Zupełnie inny tytuł"),
    ];
    stripCommonTitleSuffix(pages);
    expect(pages[0].title).toBe("Kontakt");
    expect(pages[0].fullTitle).toBe(`Kontakt${SUFFIX}`);
    expect(pages[4].title).toBe("Zupełnie inny tytuł");
    expect(pages[4].fullTitle).toBeUndefined();
  });

  test("does nothing when suffixes are not shared", () => {
    const pages = [
      page("a", "Alfa - jeden"),
      page("b", "Beta - dwa"),
      page("c", "Gamma - trzy"),
      page("d", "Delta - cztery"),
    ];
    stripCommonTitleSuffix(pages);
    expect(pages.map((p) => p.title)).toEqual(["Alfa - jeden", "Beta - dwa", "Gamma - trzy", "Delta - cztery"]);
  });

  test("never leaves an empty title", () => {
    const pages = [
      page("root", SUFFIX.slice(3)),
      page("a", `A${SUFFIX}`),
      page("b", `B${SUFFIX}`),
      page("c", `C${SUFFIX}`),
      page("d", `D${SUFFIX}`),
    ];
    stripCommonTitleSuffix(pages);
    expect(pages[0].title).toBe(SUFFIX.slice(3));
    expect(pages[1].title).toBe("A");
  });

  test("works with pipe separators (EN/DE style)", () => {
    const pages = [
      page("a", "Contact | ACME GmbH"),
      page("b", "About | ACME GmbH"),
      page("c", "Products | ACME GmbH"),
      page("d", "Impressum | ACME GmbH"),
    ];
    stripCommonTitleSuffix(pages);
    expect(pages.map((p) => p.title)).toEqual(["Contact", "About", "Products", "Impressum"]);
  });
});
