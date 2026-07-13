import { describe, expect, test } from "bun:test";
import {
  extractBrandFromHtml,
  extractColors,
  extractCssVars,
  extractFonts,
  isNeutralHex,
  selectRelevantCssVars,
} from "./brand-probe.ts";

const FIXTURE_HTML = `<!doctype html>
<html>
<head>
  <meta name="theme-color" content="#0a2540">
  <meta property="og:image" content="/og.png">
  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">
  <style>
    :root { --primary: #0a2540; --accent: #b46a2d; --text: rgb(20, 24, 32); }
    body { font-family: "Inter", sans-serif; color: #111; }
    h1 { font-family: "Source Serif", serif; color: rgba(10, 37, 64, 1); }
  </style>
</head>
<body>
  <img src="/logo.svg" alt="Acme Logo">
</body>
</html>`;

describe("extractCssVars", () => {
  test("parses CSS custom properties", () => {
    const css = ":root { --primary: #0a2540; --accent: rgb(180, 106, 45); }";
    expect(extractCssVars(css)).toEqual({
      "--primary": "#0a2540",
      "--accent": "rgb(180, 106, 45)",
    });
  });

  test("first occurrence wins", () => {
    const css = "--x: red; .y { --x: blue; }";
    expect(extractCssVars(css)["--x"]).toBe("red");
  });
});

describe("extractColors", () => {
  test("collects hex + rgb + seed", () => {
    const css = ".a{color:#0a2540}.b{color:#0a2540}.c{color:rgb(20, 24, 32)}";
    const colors = extractColors(css, "#FF0000");
    const hexes = colors.map((c) => c.hex);
    expect(hexes).toContain("#0a2540");
    expect(hexes).toContain("#141820");
    expect(hexes).toContain("#ff0000");
    expect(colors[0]?.hex).toBe("#0a2540");
  });

  test("expands shorthand hex", () => {
    const css = "color:#abc";
    expect(extractColors(css)[0]?.hex).toBe("#aabbcc");
  });

  test("accent colors sort before more frequent neutrals", () => {
    const css = `
      .a{color:#fff}.b{color:#fff}.c{color:#fff}.d{color:#fff}
      .e{color:#333}.f{color:#333}.g{color:#333}
      .h{color:#e63946}
    `;
    const hexes = extractColors(css).map((c) => c.hex);
    expect(hexes[0]).toBe("#e63946");
    expect(hexes).toContain("#ffffff");
    expect(hexes).toContain("#333333");
  });
});

describe("isNeutralHex", () => {
  test("classifies grays, near-white and near-black as neutral", () => {
    expect(isNeutralHex("#ffffff")).toBe(true);
    expect(isNeutralHex("#000000")).toBe(true);
    expect(isNeutralHex("#888888")).toBe(true);
    expect(isNeutralHex("#141820")).toBe(true);
  });

  test("keeps saturated colors as accents", () => {
    expect(isNeutralHex("#e63946")).toBe(false);
    expect(isNeutralHex("#0a2540")).toBe(false);
  });
});

describe("selectRelevantCssVars", () => {
  test("keeps brand-relevant names and color values, drops the rest", () => {
    const vars = {
      "--primary": "#0a2540",
      "--font-sans": "Inter",
      "--radius-md": "8px",
      "--tw-translate-x": "0",
      "--some-z-index": "50",
      "--random": "rgb(1, 2, 3)",
    };
    const out = selectRelevantCssVars(vars);
    expect(out["--primary"]).toBe("#0a2540");
    expect(out["--font-sans"]).toBe("Inter");
    expect(out["--radius-md"]).toBe("8px");
    expect(out["--random"]).toBe("rgb(1, 2, 3)");
    expect(out["--tw-translate-x"]).toBeUndefined();
    expect(out["--some-z-index"]).toBeUndefined();
  });

  test("caps output at 40 vars", () => {
    const vars: Record<string, string> = {};
    for (let i = 0; i < 100; i++) vars[`--color-${i}`] = `#00000${i % 10}`;
    expect(Object.keys(selectRelevantCssVars(vars))).toHaveLength(40);
  });
});

describe("extractFonts", () => {
  test("first family wins, dedup, skip generic keywords", () => {
    const css = `
      body { font-family: "Inter", sans-serif; }
      h1 { font-family: 'Source Serif', serif; }
      p { font-family: Inter, system-ui; }
      .x { font-family: var(--font); }
    `;
    const fonts = extractFonts(css).map((f) => f.family);
    expect(fonts).toEqual(["Inter", "Source Serif"]);
  });
});

describe("extractBrandFromHtml", () => {
  test("pulls theme color, favicon, logo, og:image, css vars, colors, fonts", async () => {
    const brand = await extractBrandFromHtml(FIXTURE_HTML, "https://example.com/");
    expect(brand.themeColor).toBe("#0a2540");
    expect(brand.ogImageUrl).toBe("https://example.com/og.png");
    expect(brand.faviconUrl).toBe("https://cdn.example.com/touch.png");
    expect(brand.logoUrl).toBe("https://example.com/logo.svg");
    expect(brand.logoConfidence).toBeGreaterThan(0.2);
    expect(brand.cssVars["--primary"]).toBe("#0a2540");
    expect(brand.cssVars["--accent"]).toBe("#b46a2d");
    expect(brand.colors.some((c) => c.hex === "#0a2540")).toBe(true);
    expect(brand.fonts.map((f) => f.family)).toEqual(expect.arrayContaining(["Inter", "Source Serif"]));
  });

  test("returns sparse data without crash on minimal HTML", async () => {
    const brand = await extractBrandFromHtml("<html><body></body></html>", "https://example.com/");
    expect(brand.colors).toEqual([]);
    expect(brand.fonts).toEqual([]);
    expect(brand.cssVars).toEqual({});
    expect(brand.themeColor).toBeUndefined();
    expect(brand.logoConfidence).toBe(0);
  });

  test("prefers header logo over client/reference images", async () => {
    const brand = await extractBrandFromHtml(
      `<!doctype html><html><body>
        <header><a href="/"><img src="/brand.svg" alt="Example logo"></a></header>
        <main><section class="clients"><img src="/client-logo.svg" alt="Client logo"></section></main>
      </body></html>`,
      "https://example.com/",
    );
    expect(brand.logoUrl).toBe("https://example.com/brand.svg");
    expect(brand.logoEvidence).toContain("header image");
    expect(brand.logoConfidence).toBeGreaterThan(0.8);
  });
});
