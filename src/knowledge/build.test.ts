import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJobFile, writePageFile, writeJobFile, type JobSummary } from "../repositories/storage.ts";
import { buildKnowledge } from "./build.ts";

let dir: string;
let previousScrapedDir: string | undefined;
const JOB_ID = "shop.example/123";

function pageMeta(url: string) {
  return { url, status: "done" as const, kind: "content" as const };
}

function productMeta(name: string, price: string) {
  return JSON.stringify({
    title: name,
    structure: {
      headings: [
        { level: 1, text: name },
        { level: 2, text: "Opis" },
        { level: 2, text: "Specyfikacja" },
      ],
      forms: [],
      nav: [{ text: "Sklep", href: "https://shop.example/sklep" }],
      signals: {
        jsonLdTypes: ["Product"],
        hasPrice: true,
        hasCartButton: true,
        product: { name, price, currency: "PLN" },
      },
    },
  });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "knowledge-test-"));
  previousScrapedDir = process.env.SCRAPED_DIR;
  process.env.SCRAPED_DIR = dir;

  const products = [
    ["p1", "https://shop.example/budki/hotel-motyl", "Hotel Motyl", "129.00"],
    ["p2", "https://shop.example/karmniki/karmnik-xl", "Karmnik XL", "89.00"],
    ["p3", "https://shop.example/poidelka/poidlo", "Poidło", "45.00"],
  ] as const;
  for (const [slug, url, name, price] of products) {
    await writePageFile(JOB_ID, slug, "raw.md", `# ${name}\n\nOpis produktu ${name}.`);
    await writePageFile(JOB_ID, slug, "meta.json", productMeta(name, price));
  }
  await writePageFile(JOB_ID, "o-nas", "raw.md", "# O nas\n\nRobimy budki od 2001 roku.");
  await writePageFile(
    JOB_ID,
    "o-nas",
    "meta.json",
    JSON.stringify({
      title: "O nas",
      structure: { headings: [{ level: 1, text: "O nas" }], forms: [], nav: [] },
    }),
  );
  await writeJobFile(JOB_ID, "metadata.json", "{}");
});

afterAll(async () => {
  if (previousScrapedDir === undefined) delete process.env.SCRAPED_DIR;
  else process.env.SCRAPED_DIR = previousScrapedDir;
  await rm(dir, { recursive: true, force: true });
});

function jobSummary(): JobSummary {
  return {
    id: JOB_ID,
    source: "https://shop.example",
    sourceKey: "https://shop.example",
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
    files: [],
    mapping: { status: "mapped", startedAt: "2026-07-06T00:00:00.000Z", discovered: 4 },
    pages: {
      p1: pageMeta("https://shop.example/budki/hotel-motyl"),
      p2: pageMeta("https://shop.example/karmniki/karmnik-xl"),
      p3: pageMeta("https://shop.example/poidelka/poidlo"),
      "o-nas": pageMeta("https://shop.example/o-nas"),
    },
  };
}

describe("buildKnowledge", () => {
  test("writes template, data and unique-content files", async () => {
    const manifest = await buildKnowledge(jobSummary());

    expect(manifest.clusters).toHaveLength(1);
    expect(manifest.clusters[0].label).toBe("product");
    expect(manifest.uniqueSlugs).toEqual(["o-nas"]);
    const clusterId = manifest.clusters[0].id;

    const jsonl = await readJobFile(JOB_ID, `knowledge/data/${clusterId}.jsonl`);
    const records = jsonl.trim().split("\n").map((l) => JSON.parse(l));
    expect(records).toHaveLength(3);
    expect(records.find((r) => r.slug === "p1")).toMatchObject({
      url: "https://shop.example/budki/hotel-motyl",
      title: "Hotel Motyl",
      price: "129.00",
      currency: "PLN",
    });

    const template = await readJobFile(JOB_ID, `knowledge/templates/${clusterId}.md`);
    expect(template).toContain("type: product");
    expect(template).toContain(`knowledge/data/${clusterId}.jsonl`);

    const content = await readJobFile(JOB_ID, "knowledge/content/o-nas.md");
    expect(content).toContain("Robimy budki od 2001 roku.");

    const site = await readJobFile(JOB_ID, "knowledge/site.md");
    expect(site).toContain(`| ${clusterId} | product | 0.92 | 3 |`);
    expect(site).toContain("knowledge/content/o-nas.md");

    const audit = JSON.parse(await readJobFile(JOB_ID, "knowledge/audit.json"));
    expect(audit.pagesSuccessfullyClassified).toBe(4);
    expect(audit.totalPagesScraped).toBe(4);
    expect(audit.templateClusterSummary[0]).toMatchObject({
      id: clusterId,
      pageType: "product",
      dataSourcePath: `knowledge/data/${clusterId}.jsonl`,
    });
    const diagnostics = JSON.parse(await readJobFile(JOB_ID, "knowledge/diagnostics/o-nas.json"));
    expect(diagnostics.contentConfidence).toBeGreaterThan(0.5);
    expect(await readJobFile(JOB_ID, "knowledge/raw/o-nas.md")).toContain("# O nas");
  });

  test("cleans navigation noise and marks duplicate pages", async () => {
    await writePageFile(
      JOB_ID,
      "kontakt",
      "raw.md",
      [
        "[Home](https://shop.example/)",
        "[Produkty](https://shop.example/produkty)",
        "# Kontakt",
        "",
        "Firma Example Sp. z o.o.",
        "Telefon: +48 123 456 789",
        "Email: biuro@example.pl",
        "NIP: 123-456-78-90",
        "",
        "## Polecane produkty",
        "[Karmnik XL](https://shop.example/karmnik-xl)",
      ].join("\n"),
    );
    await writePageFile(
      JOB_ID,
      "kontakt-2",
      "raw.md",
      [
        "[Home](https://shop.example/?ref=nav)",
        "[Produkty](https://shop.example/produkty)",
        "# Kontakt",
        "",
        "Firma Example Sp. z o.o.",
        "Telefon: +48 123 456 789",
        "Email: biuro@example.pl",
        "NIP: 123-456-78-90",
      ].join("\n"),
    );
    const meta = JSON.stringify({
      title: "Kontakt",
      structure: {
        headings: [
          { level: 1, text: "Kontakt" },
          { level: 2, text: "Polecane produkty" },
        ],
        forms: [],
        nav: [
          { text: "Home", href: "https://shop.example/" },
          { text: "Produkty", href: "https://shop.example/produkty" },
        ],
      },
    });
    await writePageFile(JOB_ID, "kontakt", "meta.json", meta);
    await writePageFile(JOB_ID, "kontakt-2", "meta.json", meta);

    const manifest = await buildKnowledge({
      ...jobSummary(),
      pages: {
        ...jobSummary().pages,
        kontakt: pageMeta("https://shop.example/kontakt"),
        "kontakt-2": pageMeta("https://shop.example/kontakt?ref=footer"),
      },
    });

    expect(manifest.duplicateGroups).toHaveLength(1);
    expect(manifest.duplicateGroups[0].duplicates[0]).toMatchObject({ slug: "kontakt-2" });
    const content = await readJobFile(JOB_ID, "knowledge/content/kontakt.md");
    expect(content).toContain("Firma Example");
    expect(content).not.toContain("[Home]");
    expect(content).not.toContain("Polecane produkty");
    const duplicateDiagnostics = JSON.parse(await readJobFile(JOB_ID, "knowledge/diagnostics/kontakt-2.json"));
    expect(duplicateDiagnostics.warnings).toContain("duplicate_page");
  });
});
