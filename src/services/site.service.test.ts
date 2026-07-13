import { describe, expect, test } from "bun:test";
import type { StreamPayload } from "./site.service.ts";
import { isTerminalStreamPayload } from "./site.service.ts";

function payload(
  mappingStatus: StreamPayload["mapping"]["status"],
  counts: Record<string, number>,
): StreamPayload {
  return {
    mapping: { status: mappingStatus, startedAt: "2026-01-01T00:00:00.000Z", discovered: 0 },
    pages: {},
    counts,
  };
}

describe("project status stream", () => {
  test("mapping remains active even without scraping pages", () => {
    expect(isTerminalStreamPayload(payload("mapping", { pending: 10, scraping: 0 }))).toBe(false);
  });

  test("unselected pending pages do not keep a completed stream open", () => {
    expect(isTerminalStreamPayload(payload("mapped", { pending: 10, scraping: 0 }))).toBe(true);
  });

  test("an active scrape keeps the stream open", () => {
    expect(isTerminalStreamPayload(payload("mapped", { pending: 10, scraping: 1 }))).toBe(false);
  });
});
