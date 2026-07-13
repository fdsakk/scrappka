import { describe, expect, test } from "bun:test";
import { createRobotsMatcher } from "./robots.ts";
import { canonicalize } from "./url.ts";

const UA = "Mozilla/5.0 (compatible; WebScrapperBot/0.1; +https://example.com/bot)";

describe("canonicalize", () => {
  test("strips hash, trailing slash, tracking params", () => {
    const u = new URL("https://Example.com/blog/?utm_source=x&id=1&fbclid=z#top");
    expect(canonicalize(u)).toBe("https://example.com/blog?id=1");
  });

  test("drops empty query after stripping", () => {
    const u = new URL("https://example.com/p?utm_campaign=a");
    expect(canonicalize(u)).toBe("https://example.com/p");
  });

  test("keeps meaningful params", () => {
    const u = new URL("https://example.com/search?q=test&page=2");
    expect(canonicalize(u)).toBe("https://example.com/search?q=test&page=2");
  });
});

describe("createRobotsMatcher", () => {
  const allowed = (matcher: ReturnType<typeof createRobotsMatcher>, path: string) =>
    matcher.isAllowed(new URL(`https://example.com${path}`));

  test("allows everything when robots.txt is missing", () => {
    const m = createRobotsMatcher(null, UA);
    expect(allowed(m, "/anything")).toBe(true);
  });

  test("respects Disallow for wildcard group", () => {
    const m = createRobotsMatcher("User-agent: *\nDisallow: /admin/", UA);
    expect(allowed(m, "/admin/panel")).toBe(false);
    expect(allowed(m, "/blog")).toBe(true);
  });

  test("Allow longest-match wins over Disallow", () => {
    const m = createRobotsMatcher("User-agent: *\nDisallow: /private/\nAllow: /private/public/", UA);
    expect(allowed(m, "/private/x")).toBe(false);
    expect(allowed(m, "/private/public/y")).toBe(true);
  });

  test("specific user-agent group preferred over wildcard", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: webscrapperbot\nDisallow: /secret/";
    const m = createRobotsMatcher(robots, UA);
    expect(allowed(m, "/page")).toBe(true);
    expect(allowed(m, "/secret/x")).toBe(false);
  });

  test("supports * and $ wildcards in paths", () => {
    const m = createRobotsMatcher("User-agent: *\nDisallow: /*.pdf$", UA);
    expect(allowed(m, "/file.pdf")).toBe(false);
    expect(allowed(m, "/file.pdfx")).toBe(true);
  });

  test("empty Disallow allows all", () => {
    const m = createRobotsMatcher("User-agent: *\nDisallow:", UA);
    expect(allowed(m, "/anything")).toBe(true);
  });

  test("ignores comments and blank lines", () => {
    const m = createRobotsMatcher("# hello\nUser-agent: * # all\nDisallow: /x # nope\n", UA);
    expect(allowed(m, "/x/1")).toBe(false);
  });
});
