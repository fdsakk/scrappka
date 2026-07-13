import { describe, expect, test } from "bun:test";
import { dedupeFacts, extractFacts, type Fact } from "./facts.ts";

const run = (raw: string): Fact[] => extractFacts({ slug: "p", url: "https://x/p", raw });
const values = (facts: Fact[], kind: string) => facts.filter((f) => f.kind === kind).map((f) => f.value);

describe("extractFacts", () => {
  test("prices with currency", () => {
    const f = run("Cena: 45,50 PLN oraz €19.99 i 1 200 zł.");
    expect(values(f, "price")).toContain("45,50 PLN");
    expect(values(f, "price")).toContain("€19.99");
    expect(values(f, "price")).toContain("1 200 zł");
  });

  test("measurements with units", () => {
    const f = run("Średnica wlotu 2,8 cm, wysokość 3 m, masa 500 g.");
    const m = values(f, "measurement");
    expect(m).toContain("2,8 cm");
    expect(m).toContain("3 m");
    expect(m).toContain("500 g");
  });

  test("percentages and years", () => {
    const f = run("Rabat 9% od 2018 roku, założona w 1999.");
    expect(values(f, "percentage")).toContain("9%");
    expect(values(f, "year")).toEqual(expect.arrayContaining(["2018 roku", "1999"]));
  });

  test("a calendar date does not also emit its year", () => {
    const f = run("Data podpisania: 03.01.2011.");
    expect(values(f, "date")).toEqual(["03.01.2011"]);
    expect(values(f, "year")).toEqual([]);
  });

  test("bare counts of 3+ digits", () => {
    const f = run("Zrealizowaliśmy ponad 500 projektów dla klientów.");
    expect(values(f, "count")).toContain("500");
  });

  test("a priced number is not double-counted as a bare count", () => {
    const f = run("Produkt kosztuje 1200 zł.");
    expect(values(f, "price")).toContain("1200 zł");
    expect(values(f, "count")).not.toContain("1200");
  });

  test("deduplicates identical figures", () => {
    const f = run("9% i znowu 9% i jeszcze 9%.");
    expect(values(f, "percentage")).toEqual(["9%"]);
  });

  test("each fact carries source + context", () => {
    const f = run("Wysyłka w 14 dni roboczych.");
    const fact = f.find((x) => x.value.includes("14"));
    expect(fact?.slug).toBe("p");
    expect(fact?.url).toBe("https://x/p");
    expect(fact?.context).toContain("Wysyłka");
  });

  test("no numbers yields no facts", () => {
    expect(run("Zapraszamy do kontaktu, porozmawiajmy o projekcie.")).toEqual([]);
  });

  test("skips asset ids and unlabeled filename noise", () => {
    const f = run("![produkt](https://cdn.example.com/uploads/img_12345-800x600.jpg)\nMiniatura 987654.");
    expect(f.map((x) => x.value)).not.toContain("12345");
    expect(f.map((x) => x.value)).not.toContain("987654");
  });

  test("extracts labeled contact and business identifiers with confidence", () => {
    const f = run("Telefon: +48 123 456 789, Email: biuro@example.pl, NIP: 123-456-78-90.");
    expect(f.find((x) => x.kind === "phone")).toMatchObject({ needsReview: false, label: "Telefon" });
    expect(f.find((x) => x.kind === "email")).toMatchObject({ value: "biuro@example.pl", confidence: 0.9 });
    expect(f.find((x) => x.kind === "tax_id")).toMatchObject({ label: "NIP" });
  });

  test("Polish words starting with sku/kod are not SKUs", () => {
    const f = run("Bardzo skutecznego sprzymierzeńca. Kodeks cywilny. Skupiamy się na jakości. O sku zamieszczono wpis.");
    expect(values(f, "sku")).toEqual([]);
  });

  test("labeled catalog codes are SKUs (PL/DE/EN)", () => {
    const f = run("Kod: BX-200, Artikelnummer: 4711-A, item no. AB123");
    const skus = values(f, "sku");
    expect(skus).toContain("BX-200");
    expect(skus).toContain("4711-A");
    expect(skus).toContain("AB123");
  });

  test("a unit letter glued to a diacritic word is not a measurement", () => {
    const f = run("Dla wykarmienia 3 lęgów zjada 2 gąsienice dziennie.");
    expect(values(f, "measurement")).toEqual([]);
  });

  test("'od 2011 roku' is a year, not a measurement", () => {
    const f = run("Działamy od 2011 roku.");
    expect(values(f, "measurement")).toEqual([]);
    expect(values(f, "year")).toEqual(["2011 roku"]);
  });

  test("does not extract dates or phones from image filenames", () => {
    const f = run(
      "[![mkw-05-21-12-17-14](https://x/images/mkw-05-21-12-17-14_46_16.jpg)](https://x/product)",
    );
    expect(values(f, "date")).toEqual([]);
    expect(values(f, "phone")).toEqual([]);
  });

  test("English and German measurements and counts", () => {
    const f = run("Delivery within 14 days. Gewicht 2,5 kg, Lieferzeit 3 Wochen. Über 500 Kunden, more than 200 projects.");
    const m = values(f, "measurement");
    expect(m).toContain("14 days");
    expect(m).toContain("2,5 kg");
    expect(m).toContain("3 Wochen");
    expect(values(f, "count")).toEqual(expect.arrayContaining(["500", "200"]));
  });

  test("German tax id and IBAN", () => {
    const f = run("USt-IdNr: DE 123456789. IBAN DE89 3704 0044 0532 0130 00.");
    expect(values(f, "tax_id").length).toBeGreaterThan(0);
    expect(values(f, "bank_account").length).toBeGreaterThan(0);
  });
});

describe("dedupeFacts", () => {
  const factOn = (slug: string, over: Partial<Fact> = {}): Fact[] =>
    extractFacts({ slug, url: `https://x/${slug}`, raw: "Telefon: +48 123 456 789" }).map((f) => ({ ...f, ...over }));

  test("collapses the same figure across pages with occurrences and alsoOn", () => {
    const deduped = dedupeFacts([...factOn("a"), ...factOn("b"), ...factOn("c")]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({ slug: "a", occurrences: 3, alsoOn: ["b", "c"] });
  });

  test("clean version of a figure wins over needsReview", () => {
    const deduped = dedupeFacts([
      ...factOn("a", { needsReview: true, confidence: 0.55 }),
      ...factOn("b"),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({ slug: "b", needsReview: false, occurrences: 2 });
  });

  test("different figures stay separate", () => {
    const a = extractFacts({ slug: "a", url: "https://x/a", raw: "Cena: 100 zł" });
    const b = extractFacts({ slug: "b", url: "https://x/b", raw: "Cena: 200 zł" });
    expect(dedupeFacts([...a, ...b])).toHaveLength(2);
  });

  test("same value with different meaning stays separate", () => {
    const a = extractFacts({ slug: "a", url: "https://x/a", raw: "Wysokość: 30 cm" });
    const b = extractFacts({ slug: "b", url: "https://x/b", raw: "Szerokość: 30 cm" });
    expect(dedupeFacts([...a, ...b])).toHaveLength(2);
  });
});
