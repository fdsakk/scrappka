import { describe, expect, test } from "bun:test";
import type { PageStructure } from "../scraper/html-to-md.ts";
import { clusterPages, isProductPage, pageFingerprint } from "./cluster.ts";

function structureOf(
  levels: number[],
  signals?: Partial<NonNullable<PageStructure["signals"]>>,
): PageStructure {
  return {
    headings: levels.map((level, i) => ({ level, text: `H${i}` })),
    forms: [],
    nav: [],
    signals: signals
      ? { jsonLdTypes: [], hasPrice: false, hasCartButton: false, ...signals }
      : undefined,
  };
}

describe("pageFingerprint", () => {
  test("same heading shape gives same fingerprint regardless of URL", () => {
    const a = { slug: "a", url: "https://x.com/budki/hotel-motyl", structure: structureOf([1, 2, 2]) };
    const b = { slug: "b", url: "https://x.com/karmniki/karmnik-xl", structure: structureOf([1, 2, 2]) };
    expect(pageFingerprint(a)).toBe(pageFingerprint(b));
  });

  test("different shapes differ", () => {
    const a = { slug: "a", url: "https://x.com/a", structure: structureOf([1, 2]) };
    const b = { slug: "b", url: "https://x.com/b", structure: structureOf([1, 3, 3]) };
    expect(pageFingerprint(a)).not.toBe(pageFingerprint(b));
  });
});

describe("isProductPage", () => {
  test("JSON-LD product wins", () => {
    const page = {
      slug: "p",
      url: "https://x.com/p",
      structure: structureOf([1], { product: { name: "Budka" } }),
    };
    expect(isProductPage(page)).toBe(true);
  });

  test("cart button + price counts as product", () => {
    const page = {
      slug: "p",
      url: "https://x.com/p",
      structure: structureOf([1], { hasCartButton: true, hasPrice: true }),
    };
    expect(isProductPage(page)).toBe(true);
  });

  test("price alone is not enough", () => {
    const page = { slug: "p", url: "https://x.com/p", structure: structureOf([1], { hasPrice: true }) };
    expect(isProductPage(page)).toBe(false);
  });
});

describe("clusterPages", () => {
  test("products cluster together across unrelated URLs; unique pages stay out", () => {
    const product = (slug: string, url: string) => ({
      slug,
      url,
      structure: structureOf([1, 2], { product: { name: slug } }),
    });
    const pages = [
      product("p1", "https://x.com/budki/hotel-motyl"),
      product("p2", "https://x.com/karmniki/karmnik-xl"),
      product("p3", "https://x.com/poidelka/poidlo-mini"),
      { slug: "home", url: "https://x.com", structure: structureOf([1, 2, 3]) },
      { slug: "kontakt", url: "https://x.com/kontakt", structure: structureOf([1]) },
    ];
    const { clusters, uniqueSlugs } = clusterPages(pages);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].label).toBe("product");
    expect(clusters[0].slugs.sort()).toEqual(["p1", "p2", "p3"]);
    expect(uniqueSlugs.sort()).toEqual(["home", "kontakt"]);
  });

  test("non-product pages need MIN_CLUSTER_SIZE shared fingerprints", () => {
    const shaped = (slug: string) => ({
      slug,
      url: `https://x.com/blog/${slug}`,
      structure: structureOf([1, 2, 2, 3]),
    });
    const few = clusterPages([shaped("a"), shaped("b"), shaped("c")]);
    expect(few.clusters).toHaveLength(0);
    expect(few.uniqueSlugs).toHaveLength(3);

    const enough = clusterPages([shaped("a"), shaped("b"), shaped("c"), shaped("d")]);
    expect(enough.clusters).toHaveLength(1);
    expect(enough.clusters[0].label).toBe("article");
  });

  test("pages without headings never cluster", () => {
    const empty = (slug: string) => ({ slug, url: `https://x.com/${slug}`, structure: structureOf([]) });
    const { clusters, uniqueSlugs } = clusterPages([empty("a"), empty("b"), empty("c"), empty("d"), empty("e")]);
    expect(clusters).toHaveLength(0);
    expect(uniqueSlugs).toHaveLength(5);
  });

  test("catalog cluster without commerce signals is labeled product", () => {
    const item = (slug: string) => ({
      slug,
      url: `https://x.com/katalog/${slug}`,
      structure: structureOf([1, 2, 3]),
      cleanedMarkdown: `# Budka lęgowa drewniana ${slug}\n\nOpis produktu.\n\n### Dane techniczne\n\n| wymiary | 10 cm |`,
    });
    const { clusters } = clusterPages([item("a"), item("b"), item("c"), item("d")]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].label).toBe("product");
  });

  test("single product page stays unique", () => {
    const { clusters, uniqueSlugs } = clusterPages([
      { slug: "p", url: "https://x.com/p", structure: structureOf([1], { product: { name: "x" } }) },
    ]);
    expect(clusters).toHaveLength(0);
    expect(uniqueSlugs).toEqual(["p"]);
  });

  test("products with different layouts form separate clusters", () => {
    const product = (slug: string, levels: number[]) => ({
      slug,
      url: `https://x.com/${slug}`,
      structure: structureOf(levels, { product: { name: slug } }),
    });
    const { clusters } = clusterPages([
      product("a1", [1, 2]),
      product("a2", [1, 2]),
      product("b1", [1, 3, 3]),
      product("b2", [1, 3, 3]),
    ]);
    expect(clusters).toHaveLength(2);
  });

  test("technical catalog pages override category URL hints", () => {
    const item = (slug: string) => ({
      slug,
      url: `https://x.com/category/${slug}`,
      structure: structureOf([1, 2, 3]),
      cleanedMarkdown: `# ${slug}\n\n### Technical data\n\nWidth: 10 cm`,
    });
    const { clusters } = clusterPages([item("a"), item("b"), item("c"), item("d")]);
    expect(clusters[0]?.label).toBe("product");
  });
});
