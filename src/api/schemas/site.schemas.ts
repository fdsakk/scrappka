export interface StartMapInput {
  url: string;
  limit?: number;
  includeSubdomains: boolean;
}

export interface ScrapeInput {
  slugs: string[];
}

export function parseStartMapInput(body: Record<string, unknown>): StartMapInput {
  return {
    url: String(body.url ?? "").trim(),
    limit: typeof body.limit === "number" ? body.limit : undefined,
    includeSubdomains: body.includeSubdomains === true,
  };
}

export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function parseScrapeInput(body: Record<string, unknown>): ScrapeInput {
  const slugs = Array.isArray(body.slugs) ? body.slugs.filter((s): s is string => typeof s === "string") : [];
  return { slugs };
}
