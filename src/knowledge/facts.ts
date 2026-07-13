/**
 * Deterministic fact allow-list. Pulls concrete numeric claims — prices,
 * measurements, percentages, years, counts — straight out of the scraped
 * markdown so the rebuild agent has a checkable ground truth. The agent is told
 * (in PROMPT.md) to reuse only figures that appear here, which turns "don't
 * invent numbers" from a hope into something verifiable: every number in the
 * output should trace back to a fact row.
 *
 * No LLM, no inference — a fact is a verbatim span plus where it was scraped
 * from. Interpretation stays the agent's job; this file only says "these exact
 * figures were on the page".
 */
export type FactKind =
  | "price"
  | "percentage"
  | "measurement"
  | "date"
  | "year"
  | "count"
  | "phone"
  | "email"
  | "tax_id"
  | "bank_account"
  | "sku"
  | "other";

export interface Fact {
  kind: FactKind;
  /** The figure exactly as written on the page (e.g. "45,50 PLN", "2,8 cm"). */
  value: string;
  unit?: string;
  label?: string;
  /** Trimmed surrounding sentence, so the agent sees what the number refers to. */
  context: string;
  slug: string;
  url: string;
  confidence: number;
  needsReview: boolean;
  /** Set by `dedupeFacts`: number of pages this exact figure appeared on. */
  occurrences?: number;
  /** Set by `dedupeFacts`: sample of other slugs carrying the same figure (max 10). */
  alsoOn?: string[];
}

const MAX_FACTS_PER_PAGE = 200;
const MAX_CONTEXT_CHARS = 160;

// Currency amounts: "45,50 PLN", "1 200 zł", "€19.99", "$5".
const PRICE_RE =
  /(?:[€$£]\s?\d[\d\s.,]*\d|\d[\d\s.,]*\d\s?(?:zł|pln|eur|usd|gbp|chf|€|\$|£))/gi;
// Measurements with a unit (PL/EN/DE) — physical dimensions plus time periods,
// which are just as much a factual claim (delivery "14 dni", warranty
// "2 Jahre"). The trailing lookahead replaces `\b`, which is ASCII-only and
// treats a following diacritic as a boundary ("3 lęgów" → "3 l").
const MEASURE_RE =
  /\b\d[\d.,]*\s?(?:mm|cm|dm|m|km|ml|l|g|kg|mg|szt\.?|stk\.?|pcs\.?|cala?|inch(?:es)?|"|dni|dzie[nń]|day(?:s)?|tag(?:e|en)?|tygodni?e?|week(?:s)?|woche(?:n)?|miesi[ąę]c[ey]?|month(?:s)?|monat(?:e|en)?|lat[a]?|rok[u]?|year(?:s)?|jahr(?:e|en)?|godz\.?|hour(?:s)?|stunde(?:n)?|min\.?|h)(?![a-ząćęłńóśźżäöüß])/gi;
const PERCENT_RE = /\b\d[\d.,]*\s?%/g;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2}\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const TAX_ID_RE =
  /\b(?:NIP|REGON|KRS|USt[-.\s]?IdNr\.?|Steuernummer|VAT(?:\s+ID)?|Company (?:No|Number)\.?)[:\s-]*[A-Z]{0,3}\s?\d[\d\s-]{6,}\d\b/gi;
const BANK_RE =
  /\b(?:IBAN|konto|rachunek|nr rachunku|bank|account number|kontonummer)[:\s-]*(?:[A-Z]{2}\d{2}\s?)?\d(?:[\s-]?\d){14,30}\b/gi;
// Label (case-insensitive) + separator + code. The code part is validated in
// `collectSkus` — `[A-Z0-9]` with the `i` flag also matches lowercase, and a
// bare `\bSKU`/`\bkod` prefix otherwise swallows ordinary words ("skutecznego",
// "kodeks").
const SKU_RE =
  /\b(?:SKU|kod|indeks|nr katalogowy|numer katalogowy|art\.?\s?nr\.?|artikel(?:nummer|[-\s]?nr\.?)|bestellnummer|item no\.?|product code|catalog(?:ue)? no\.?)[:\s-]+([A-Z0-9][A-Z0-9._/-]{2,})\b/gi;
// Bare counts — the classic fabricated stat ("500 projektów"). Either a
// thousands-grouped number (1 000, 4.000.000) or a plain 3–6 digit run; longer
// unbroken runs are almost always identifiers (phone, NIP, postal, account) and
// only add noise, so they are left out.
const COUNT_RE = /\b(?:\d{1,3}(?:[.,\s]\d{3})+|\d{3,6})\b/g;
const COUNT_CONTEXT_RE =
  /(ponad|około|ok\.|minimum|maksimum|liczba|ilość|sztuk|szt\.|projektów|realizacji|klientów|produktów|zamówień|lat doświadczenia|pracowników|egzemplarzy|over|more than|about|approx\.?|number of|clients|customers|projects|products|orders|employees|years of experience|über|mehr als|etwa|ca\.|anzahl|kunden|projekte|produkte|bestellungen|mitarbeiter|jahre erfahrung)/i;
const ASSET_CONTEXT_RE =
  /(?:!\[[^\]]*\]\([^)]+\)|\b(?:src|href|image|img|thumbnail|thumb|attachment|uploads?|wp-content|cdn|static|assets?|jpg|jpeg|png|webp|gif|svg|pdf)\b|[-_/][a-f0-9]{6,}\b|\.(?:jpg|jpeg|png|webp|gif|svg|pdf)\b)/i;

/**
 * Collapses the same figure repeated across pages (footer phone, shared specs)
 * into one row: first page's context kept, `occurrences` counts pages, `alsoOn`
 * samples the other slugs. A reviewed-clean version of a figure wins over a
 * `needsReview` one. Keeps the allow-list greppable without shipping hundreds
 * of identical rows.
 */
export function dedupeFacts(facts: Fact[]): Fact[] {
  const byKey = new Map<string, Fact>();
  for (const fact of facts) {
    const key = factSemanticKey(fact);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...fact, occurrences: 1 });
      continue;
    }
    existing.occurrences = (existing.occurrences ?? 1) + 1;
    if (existing.slug !== fact.slug && (existing.alsoOn?.length ?? 0) < 10) {
      existing.alsoOn = existing.alsoOn ?? [];
      if (!existing.alsoOn.includes(fact.slug)) existing.alsoOn.push(fact.slug);
    }
    if (existing.needsReview && !fact.needsReview) {
      byKey.set(key, { ...fact, occurrences: existing.occurrences, alsoOn: existing.alsoOn });
    }
  }
  return [...byKey.values()];
}

/** Extracts numeric facts from one page's scraped markdown. */
export function extractFacts(input: { slug: string; url: string; raw: string }): Fact[] {
  const out: Fact[] = [];
  const seen = new Set<string>();
  const claimed: Array<{ start: number; end: number }> = [];
  const text = factSourceText(input.raw);

  const collect = (re: RegExp, kind: FactKind): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (out.length >= MAX_FACTS_PER_PAGE) return;
      if (overlapsClaimed(m.index, m[0].length, claimed)) continue;
      const value = m[0].replace(/\s+/g, " ").trim();
      const context = contextAround(text, m.index, m[0].length);
      if (looksLikeAssetNoise(context, value)) continue;
      // "od 2011 roku" / "seit 2011" matches the time-period units but is a
      // year claim, not a measurement.
      const actualKind = kind === "measurement" && /^(?:19|20)\d{2}\b/.test(value) ? "year" : kind;
      const key = `${actualKind}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(makeFact(actualKind, value, context, input));
      claimed.push({ start: m.index, end: m.index + m[0].length });
    }
  };

  // Order matters: prices and measurements before bare counts so a priced
  // number isn't also captured as a naked count.
  collect(EMAIL_RE, "email");
  collect(BANK_RE, "bank_account");
  collect(TAX_ID_RE, "tax_id");
  collectSkus(text, out, seen, claimed, input);
  collect(PRICE_RE, "price");
  collect(MEASURE_RE, "measurement");
  collect(PERCENT_RE, "percentage");
  collect(DATE_RE, "date");
  collect(YEAR_RE, "year");
  collectPhones(text, out, seen, claimed, input);
  collectCounts(text, out, seen, claimed, input);
  return out;
}

/**
 * SKUs need post-validation the shared collector can't express: the label
 * matches case-insensitively, but a real catalog code is uppercase or contains
 * a digit. Rejects prose that happens to follow a label-like word.
 */
function collectSkus(
  text: string,
  out: Fact[],
  seen: Set<string>,
  claimed: Array<{ start: number; end: number }>,
  input: { slug: string; url: string },
): void {
  SKU_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SKU_RE.exec(text)) !== null) {
    if (out.length >= MAX_FACTS_PER_PAGE) return;
    if (overlapsClaimed(m.index, m[0].length, claimed)) continue;
    const code = m[1];
    if (!/\d/.test(code) && code !== code.toUpperCase()) continue;
    const context = contextAround(text, m.index, m[0].length);
    if (looksLikeAssetNoise(context, code)) continue;
    const key = `sku:${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeFact("sku", code, context, input));
    claimed.push({ start: m.index, end: m.index + m[0].length });
  }
}

function collectCounts(
  text: string,
  out: Fact[],
  seen: Set<string>,
  claimed: Array<{ start: number; end: number }>,
  input: { slug: string; url: string },
): void {
  COUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COUNT_RE.exec(text)) !== null) {
    if (out.length >= MAX_FACTS_PER_PAGE) return;
    if (overlapsClaimed(m.index, m[0].length, claimed)) continue;
    const value = m[0].replace(/\s+/g, " ").trim();
    const context = contextAround(text, m.index, m[0].length);
    if (looksLikeAssetNoise(context, value)) continue;
    if (!COUNT_CONTEXT_RE.test(context)) continue;
    const key = `count:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeFact("count", value, context, input));
    claimed.push({ start: m.index, end: m.index + m[0].length });
  }
}

function collectPhones(
  text: string,
  out: Fact[],
  seen: Set<string>,
  claimed: Array<{ start: number; end: number }>,
  input: { slug: string; url: string },
): void {
  PHONE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_RE.exec(text)) !== null) {
    if (out.length >= MAX_FACTS_PER_PAGE) return;
    if (overlapsClaimed(m.index, m[0].length, claimed)) continue;
    const value = m[0].replace(/\s+/g, " ").trim();
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    const context = contextAround(text, m.index, m[0].length);
    if (looksLikeAssetNoise(context, value)) continue;
    if (!/(tel\.?|telefon|phone|mobile|handy|rufnummer|kontakt|contact|kom\.?|fax|\+)/i.test(context)) continue;
    const key = `phone:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeFact("phone", value, context, input));
    claimed.push({ start: m.index, end: m.index + m[0].length });
  }
}

function makeFact(
  kind: FactKind,
  value: string,
  context: string,
  input: { slug: string; url: string },
): Fact {
  const weak = isWeakContext(kind, context, value);
  const fact: Fact = {
    kind,
    value,
    context,
    slug: input.slug,
    url: input.url,
    confidence: weak ? 0.55 : 0.9,
    needsReview: weak,
  };
  const unit = unitFor(kind, value);
  if (unit) fact.unit = unit;
  const label = labelFor(context, value, kind);
  if (label) fact.label = label;
  return fact;
}

function unitFor(kind: FactKind, value: string): string | undefined {
  if (kind === "price") return value.match(/zł|pln|eur|usd|gbp|€|\$|£/i)?.[0];
  if (kind === "percentage") return "%";
  if (kind === "measurement") return value.match(/[a-ząćęłńóśźżäöüß."]+$/i)?.[0];
  return undefined;
}

function labelFor(context: string, value: string, kind: FactKind): string | undefined {
  const idx = context.toLowerCase().indexOf(value.toLowerCase());
  const left = (idx >= 0 ? context.slice(Math.max(0, idx - 48), idx) : context.slice(0, 48))
    .replace(/[#*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const labeled = left.match(/([A-ZÄÖÜĄĆĘŁŃÓŚŹŻa-zäöüßąćęłńóśźż ]{3,32})[:：-]\s*$/);
  if (labeled?.[1]) return labeled[1].trim();
  if (kind === "price" && /cena|price|preis/i.test(context)) return "Cena";
  if (kind === "phone") return "Telefon";
  if (kind === "email") return "Email";
  if (kind === "tax_id")
    return context.match(/\b(NIP|REGON|KRS|USt[-.\s]?IdNr\.?|Steuernummer|VAT(?:\s+ID)?)\b/i)?.[1]?.toUpperCase();
  if (kind === "bank_account") return "Rachunek bankowy";
  if (kind === "sku")
    return context.match(/\b(SKU|kod|indeks|nr katalogowy|numer katalogowy|artikelnummer|bestellnummer|item no\.?|product code)\b/i)?.[1];
  return undefined;
}

function isWeakContext(kind: FactKind, context: string, value: string): boolean {
  if (looksLikeAssetNoise(context, value)) return true;
  if (kind === "count") return !COUNT_CONTEXT_RE.test(context);
  if (kind === "year")
    return !/(od|rok|roku|lat|założ|powsta|data|since|founded|established|year|seit|gegründet|jahr|copyright|©)/i.test(context);
  return false;
}

function looksLikeAssetNoise(context: string, value: string): boolean {
  const compact = context.replace(/\s+/g, " ");
  if (!ASSET_CONTEXT_RE.test(compact)) return false;
  if (/\b(NIP|REGON|KRS|SKU|kod|cena|wymiar|średnica|wysokość|szerokość|długość|telefon|tel\.?|konto|rachunek)\b/i.test(compact)) {
    return false;
  }
  const valueDigits = value.replace(/\D/g, "");
  if (valueDigits.length >= 3) return true;
  return /\.(?:jpg|jpeg|png|webp|gif|svg|pdf)(?:\)|\s|$)/i.test(compact);
}

function contextAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - MAX_CONTEXT_CHARS / 2);
  const end = Math.min(text.length, index + length + MAX_CONTEXT_CHARS / 2);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function overlapsClaimed(
  index: number,
  length: number,
  claimed: Array<{ start: number; end: number }>,
): boolean {
  const end = index + length;
  return claimed.some((span) => index < span.end && end > span.start);
}

/** Removes asset targets before regex extraction while preserving visible link text. */
function factSourceText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^\n)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function factSemanticKey(fact: Fact): string {
  const value = fact.value.toLowerCase().replace(/\s+/g, " ").trim();
  const semantic = (fact.label ?? fact.context)
    .toLowerCase()
    .replace(fact.value.toLowerCase(), "#")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9ąćęłńóśźżäöüß#%]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${fact.kind}:${value}:${semantic}`;
}
