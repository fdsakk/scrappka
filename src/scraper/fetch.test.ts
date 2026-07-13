import { afterEach, describe, expect, test } from "bun:test";
import { fetchPublicText } from "./fetch.ts";
import { BlockedUrlError } from "./ssrf-guard.ts";

const originalFetch = globalThis.fetch;
const PUBLIC_URL = "https://93.184.216.34/start";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchPublicText", () => {
  test("blocks a redirect to a private address before requesting it", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested.push(String(input));
      return new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/admin" } });
    }) as unknown as typeof fetch;

    await expect(fetchPublicText(PUBLIC_URL)).rejects.toBeInstanceOf(BlockedUrlError);
    expect(requested).toEqual([PUBLIC_URL]);
  });

  test("caps redirect chains", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: `https://93.184.216.34/hop-${requests}` },
      });
    }) as unknown as typeof fetch;

    await expect(fetchPublicText(PUBLIC_URL)).rejects.toThrow("Too many redirects");
    expect(requests).toBe(6);
  });

  test("rejects bodies above the configured byte cap", async () => {
    globalThis.fetch = (async () =>
      new Response("12345", { status: 200, headers: { "Content-Length": "5" } })) as unknown as typeof fetch;

    await expect(fetchPublicText(PUBLIC_URL, { maxBytes: 4 })).rejects.toThrow("Response too large");
  });
});
