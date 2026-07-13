import type { PageCluster } from "./cluster.ts";
import type { LoadedPage } from "./types.ts";

/** One JSONL row per cluster member — the "data, not documents" layer. */
export function recordFor(page: LoadedPage, cluster: PageCluster): Record<string, unknown> {
  const product = page.structure?.signals?.product;
  const record: Record<string, unknown> = {
    slug: page.slug,
    sourceUrl: page.url,
    url: page.url,
    title: page.title ?? product?.name,
    contentConfidence: page.diagnostics.contentConfidence,
    templateConfidence: cluster.confidence,
    isDuplicate: page.duplicate?.isDuplicate ?? false,
    canonicalSlug: page.duplicate?.canonicalSlug === page.slug ? null : page.duplicate?.canonicalSlug,
    warnings: page.diagnostics.warnings,
  };
  if (page.fullTitle) record.fullTitle = page.fullTitle;
  if (page.duplicate?.isDuplicate) {
    record.duplicateOf = page.duplicate.duplicateOf;
    record.duplicateConfidence = page.duplicate.duplicateConfidence;
  }
  if (page.description) record.description = page.description;
  if (page.description) record.metaDescription = page.description;
  if (product) {
    if (product.name) record.productName = product.name;
    if (product.description && !record.description) {
      record.description = product.description;
      record.shortDescription = product.description;
    }
    if (product.price) record.price = product.price;
    if (product.currency) record.currency = product.currency;
    if (product.sku) record.sku = product.sku;
    if (product.brand) record.brand = product.brand;
    if (product.category) {
      record.category = product.category;
      record.categoryPath = [product.category];
    }
    if (product.images) record.images = product.images.map((url) => ({ url, alt: null }));
  }
  const h2 = (page.structure?.headings ?? []).filter((h) => h.level === 2).map((h) => h.text);
  if (h2.length > 0) record.sections = h2.slice(0, 12);
  const images = imageRecords(page.cleanedMarkdown);
  if (images.length > 0 && !record.images) record.images = images;
  const bullets = featureBullets(page.cleanedMarkdown);
  if (bullets.length > 0) record.featureBullets = bullets;
  const technicalData = technicalDataFrom(page.cleanedMarkdown);
  if (Object.keys(technicalData).length > 0) record.technicalData = technicalData;
  const attributes = attributeHints(page.cleanedMarkdown);
  Object.assign(record, attributes);
  const pdfLinks = linksFrom(page.cleanedMarkdown).filter((l) => /\.pdf(?:$|[?#])/i.test(l.href));
  if (pdfLinks.length > 0) record.pdfLinks = pdfLinks;
  const ctaLinks = linksFrom(page.cleanedMarkdown).filter((l) =>
    /(kup|sklep|zamów|zapytaj|kontakt|ask|buy|shop|order|enquire|contact|kaufen|bestellen|anfrage)/i.test(l.text),
  );
  if (ctaLinks.length > 0) record.ctaLinks = ctaLinks.slice(0, 10);
  const internalLinks = linksFrom(page.cleanedMarkdown).filter((l) => sameOrigin(l.href, page.url));
  if (internalLinks.length > 0) record.internalLinks = internalLinks.slice(0, 25);
  const relatedProducts = relatedProductsFrom(page.raw);
  if (relatedProducts.length > 0) record.relatedProducts = relatedProducts;

  if (cluster.label === "article" || cluster.label === "case_study") {
    const lead = images[0];
    if (lead) record.leadImage = lead;
    record.headings = (page.structure?.headings ?? []).map((h) => h.text).slice(0, 20);
    record.bodyContent = page.cleanedMarkdown.slice(0, 12_000);
    const date = firstDate(page.cleanedMarkdown);
    if (date) record.date = date;
  }
  if (cluster.label === "contact") {
    Object.assign(record, contactFieldsFrom(page.cleanedMarkdown));
  }
  return record;
}

function imageRecords(markdown: string): { url: string; alt: string | null }[] {
  const out: { url: string; alt: string | null }[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) out.push({ alt: m[1] || null, url: m[2] });
  return out.slice(0, 20);
}

function linksFrom(markdown: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) out.push({ text: m[1].replace(/\s+/g, " ").trim(), href: m[2] });
  return out;
}

function featureBullets(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim())
    .filter((line): line is string => Boolean(line && line.length > 12 && !/^\[[^\]]+\]\([^)]+\)$/.test(line)))
    .slice(0, 20);
}

function technicalDataFrom(markdown: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = markdown.split(/\r?\n/);
  let inTechnical = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)?.[1];
    if (heading) {
      inTechnical = /(specyfikacja|dane techniczne|parametry|wymiary|technical|specifications?|technische daten|abmessungen)/i.test(heading);
      continue;
    }
    if (!inTechnical) continue;
    const table = line.match(/^\|\s*([^|]{2,40})\s*\|\s*([^|]{1,120})\s*\|$/);
    const kv = line.match(/^(?:[-*]\s*)?([^:：|]{2,40})[:：]\s*(.{1,160})$/);
    const match = table ?? kv;
    if (!match) continue;
    const key = match[1].replace(/\s+/g, " ").trim();
    const value = match[2].replace(/\s+/g, " ").trim();
    if (/^-+$/.test(key) || /^-+$/.test(value)) continue;
    out[key] = value;
  }
  return out;
}

function attributeHints(markdown: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = markdown.replace(/\s+/g, " ");
  const pick = (key: string, re: RegExp) => {
    const value = text.match(re)?.[1]?.trim();
    if (value) out[key] = value;
  };
  pick("dimensions", /\b(?:wymiary|rozmiar|średnica|wysokość|szerokość|długość|dimensions?|size|diameter|height|width|length|abmessungen|größe|durchmesser|höhe|breite|länge)[:\s-]+([^.;\n]{2,80})/i);
  pick("material", /\b(?:materiał|material|werkstoff)[:\s-]+([^.;\n]{2,80})/i);
  pick("color", /\b(?:kolor|barwa|palette|paleta|colou?r|farbe)[:\s-]+([^.;\n]{2,80})/i);
  pick("species", /\b(?:dla|gatunek|zwierzęta|animals?|tierart(?:en)?)[:\s-]+([^.;\n]{2,100})/i);
  const certs = text.match(/\b(?:certyfikat|certyfikaty|rekomendacja|polecane przez|certificates?|certified|recommended by|zertifikat(?:e)?|zertifiziert|empfohlen von)[^.;\n]{0,120}/gi);
  if (certs?.length) out.certificates = certs.slice(0, 10);
  return out;
}

function relatedProductsFrom(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inRelated = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s+(.+)$/)?.[1];
    if (heading) inRelated = /(polecane produkty|related products|zobacz również|podobne produkty|similar products|you may also like|ähnliche produkte|zubehör)/i.test(heading);
    if (!inRelated) continue;
    const link = line.match(/\[([^\]]{2,80})\]\([^)]+\)/)?.[1];
    if (link && !out.includes(link)) out.push(link);
    if (out.length >= 20) break;
  }
  return out;
}

function firstDate(markdown: string): string | undefined {
  return markdown.match(/\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2}\b/)?.[0] ?? markdown.match(/\b(?:19|20)\d{2}\b/)?.[0];
}

function contactFieldsFrom(markdown: string): Record<string, unknown> {
  const text = markdown.replace(/\s+/g, " ");
  const out: Record<string, unknown> = {};
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  if (email) out.email = email;
  const phone = text.match(/(?:tel\.?|telefon|phone|mobile|handy)[:\s-]*(\+?\d[\d\s().-]{6,}\d)/i)?.[1]?.trim();
  if (phone) out.phone = phone;
  const nip = text.match(/\bNIP[:\s-]*([A-Z]{0,3}\s?\d[\d\s-]{6,}\d)\b/i)?.[1]?.trim();
  const regon = text.match(/\bREGON[:\s-]*(\d[\d\s-]{6,}\d)\b/i)?.[1]?.trim();
  if (nip || regon) out.identifiers = { ...(nip ? { nip } : {}), ...(regon ? { regon } : {}) };
  const bank = text.match(/\b(?:IBAN|konto|rachunek|nr rachunku|bank)[:\s-]*((?:[A-Z]{2}\d{2}\s*)?\d{2}(?:\s?\d{4}){5,7})\b/i)?.[1]?.trim();
  if (bank) out.bankAccount = bank;
  const hours = text.match(/\b(?:godziny otwarcia|czynne|otwarte|opening hours|öffnungszeiten|geöffnet)[:\s-]+([^.\n]{5,120})/i)?.[1]?.trim();
  if (hours) out.openingHours = hours;
  const company = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (company && !/kontakt|contact/i.test(company)) out.companyName = company;
  return out;
}

function sameOrigin(href: string, base: string): boolean {
  try {
    return new URL(href, base).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
