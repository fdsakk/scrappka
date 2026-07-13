import { describe, expect, test } from "bun:test";
import { htmlToMarkdown } from "./html-to-md.ts";

const STRUCTURE_HTML = `
  <html><body>
    <header>
      <nav>
        <a href="/about">About</a>
        <a href="/pricing">Pricing</a>
        <a href="/about">About</a>
        <a href="#skip">Skip</a>
      </nav>
    </header>
    <main>
      <h1>Welcome</h1>
      <h2>Features</h2>
      <h3>Speed</h3>
      <form action="/contact" method="post">
        <label for="email">Your email</label>
        <input id="email" type="email" name="email" required>
        <input type="hidden" name="csrf" value="x">
        <label>Message<textarea name="message" placeholder="Say hi"></textarea></label>
        <button type="submit">Send message</button>
      </form>
    </main>
    <footer>© 2026 Acme Inc. All rights reserved.</footer>
  </body></html>`;

const URL = "https://example.com/post";

describe("htmlToMarkdown", () => {
  test("converts headings, lists, links, images", () => {
    const html = `
      <html><body><main>
        <h1>Title</h1>
        <p>Hello <a href="/about">world</a>.</p>
        <ul><li>one</li><li>two</li></ul>
        <img src="/img.png" alt="pic">
      </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).toContain("# Title");
    expect(markdown).toContain("[world](https://example.com/about)");
    expect(markdown).toMatch(/- {1,3}one/);
    expect(markdown).toMatch(/- {1,3}two/);
    expect(markdown).toContain("![pic](https://example.com/img.png)");
  });

  test("strips scripts, styles, nav, footer, iframe", () => {
    const html = `
      <html><body>
        <nav>NAVBAR</nav>
        <main>
          <script>alert(1)</script>
          <style>.x{}</style>
          <iframe src="x"></iframe>
          <p>keep me</p>
        </main>
        <footer>FOOT</footer>
      </body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).toContain("keep me");
    expect(markdown).not.toContain("NAVBAR");
    expect(markdown).not.toContain("FOOT");
    expect(markdown).not.toContain("alert");
    expect(markdown).not.toContain(".x{}");
  });

  test("resolves relative urls against page url", () => {
    const html = `<html><body><main>
      <a href="../foo">f</a>
      <a href="https://other.com/x">x</a>
      <img src="bar.png" alt="b">
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: "https://example.com/blog/post", html, useReadability: false });
    expect(markdown).toContain("(https://example.com/foo)");
    expect(markdown).toContain("(https://other.com/x)");
    expect(markdown).toContain("(https://example.com/blog/bar.png)");
  });

  test("strips tracking params from links", () => {
    const html = `<html><body><main>
      <a href="https://x.com/p?utm_source=a&id=1&fbclid=zzz">l</a>
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).toContain("id=1");
    expect(markdown).not.toContain("utm_source");
    expect(markdown).not.toContain("fbclid");
  });

  test("preserves fenced code with language", () => {
    const html = `<html><body><main>
      <pre><code class="language-ts">const x: number = 1;</code></pre>
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).toContain("```ts");
    expect(markdown).toContain("const x: number = 1;");
  });

  test("preserves GFM tables", () => {
    const html = `<html><body><main>
      <table>
        <thead><tr><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).toContain("| A | B |");
    expect(markdown).toContain("| 1 | 2 |");
  });

  test("unwraps picture to first img", () => {
    const html = `<html><body><main>
      <picture>
        <source srcset="big.webp" type="image/webp">
        <img src="fallback.jpg" alt="p">
      </picture>
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).toContain("![p](https://example.com/fallback.jpg)");
  });

  test("falls back when readability returns null on tiny content", () => {
    const html = `<html><body><main><p>tiny</p></main></body></html>`;
    const { markdown, usedReadability } = htmlToMarkdown({ url: URL, html });
    expect(markdown).toContain("tiny");
    expect(usedReadability).toBe(false);
  });

  test("uses readability for article-shaped content and extracts title", () => {
    const html = `<html><head><title>Doc Title</title></head><body>
      <nav>navnav</nav>
      <article>
        <h1>The Real Title</h1>
        <p>${"This is a paragraph of meaningful content. ".repeat(30)}</p>
        <p>${"More substantive prose here to satisfy readability heuristics. ".repeat(20)}</p>
      </article>
      <footer>footfoot</footer>
    </body></html>`;
    const { markdown, title, usedReadability } = htmlToMarkdown({ url: URL, html });
    expect(usedReadability).toBe(true);
    expect(title).toBeTruthy();
    expect(markdown).toContain("meaningful content");
    expect(markdown).not.toContain("navnav");
    expect(markdown).not.toContain("footfoot");
  });

  test("normalizes whitespace - no triple newlines, no trailing spaces", () => {
    const html = `<html><body><main>
      <p>a</p><p></p><p></p><p>b</p>
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).not.toMatch(/\n{3,}/);
    expect(markdown).not.toMatch(/[ \t]+\n/);
  });

  test("drops comments", () => {
    const html = `<html><body><main>
      <!-- secret -->
      <p>visible</p>
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).not.toContain("secret");
    expect(markdown).toContain("visible");
  });

  test("extracts structure: headings, forms, nav, footer", () => {
    const { structure, markdown } = htmlToMarkdown({ url: URL, html: STRUCTURE_HTML, useReadability: false });

    expect(structure.headings).toEqual([
      { level: 1, text: "Welcome" },
      { level: 2, text: "Features" },
      { level: 3, text: "Speed" },
    ]);

    expect(structure.forms).toHaveLength(1);
    const form = structure.forms[0]!;
    expect(form.action).toBe("/contact");
    expect(form.method).toBe("post");
    expect(form.submitLabel).toBe("Send message");
    expect(form.fields).toHaveLength(2);
    expect(form.fields[0]).toEqual({
      tag: "input",
      type: "email",
      name: "email",
      label: "Your email",
      required: true,
    });
    expect(form.fields[1]?.label).toContain("Message");
    expect(form.fields[1]?.placeholder).toBe("Say hi");

    expect(structure.nav).toEqual([
      { text: "About", href: "https://example.com/about" },
      { text: "Pricing", href: "https://example.com/pricing" },
    ]);

    expect(structure.footerText).toContain("Acme Inc");

    // markdown output still drops nav/footer/form noise
    expect(markdown).not.toContain("Pricing");
    expect(markdown).not.toContain("All rights reserved");
  });

  test("structure is empty on plain content", () => {
    const { structure } = htmlToMarkdown({ url: URL, html: "<html><body><p>hi</p></body></html>", useReadability: false });
    expect(structure.forms).toEqual([]);
    expect(structure.nav).toEqual([]);
    expect(structure.headings).toEqual([]);
    expect(structure.footerText).toBeUndefined();
  });

  test("handles bold, italic, strikethrough, inline code", () => {
    const html = `<html><body><main>
      <p><strong>b</strong> <em>i</em> <del>s</del> <code>c</code></p>
    </main></body></html>`;
    const { markdown } = htmlToMarkdown({ url: URL, html, useReadability: false });
    expect(markdown).toContain("**b**");
    expect(markdown).toContain("_i_");
    expect(markdown).toContain("~s~");
    expect(markdown).toContain("`c`");
  });
});

describe("page signals", () => {
	test("extracts JSON-LD product with offer price", () => {
		const html = `<html><head>
			<meta property="og:type" content="product">
			<script type="application/ld+json">${JSON.stringify({
				"@context": "https://schema.org",
				"@type": "Product",
				name: "Hotel dla owadów typ motyl",
				sku: "MKW-3W1",
				brand: { "@type": "Brand", name: "Budka" },
				image: ["https://x.com/a.jpg"],
				offers: { "@type": "Offer", price: "129.00", priceCurrency: "PLN" },
			})}</script>
			</head><body><h1>Hotel dla owadów</h1>
			<p>Cena: 129,00 zł</p>
			<button>Dodaj do koszyka</button>
			</body></html>`;
		const { structure } = htmlToMarkdown({ url: "https://x.com/p", html });
		const signals = structure.signals;
		expect(signals?.ogType).toBe("product");
		expect(signals?.jsonLdTypes).toContain("Product");
		expect(signals?.product?.name).toBe("Hotel dla owadów typ motyl");
		expect(signals?.product?.price).toBe("129.00");
		expect(signals?.product?.currency).toBe("PLN");
		expect(signals?.product?.brand).toBe("Budka");
		expect(signals?.hasPrice).toBe(true);
		expect(signals?.hasCartButton).toBe(true);
	});

	test("plain article page has no product signals", () => {
		const html = `<html><body><h1>O nas</h1><p>Firma istnieje od 2001 roku i robi budki.</p></body></html>`;
		const { structure } = htmlToMarkdown({ url: "https://x.com/o-nas", html });
		expect(structure.signals?.product).toBeUndefined();
		expect(structure.signals?.hasCartButton).toBe(false);
	});

	test("finds Product inside @graph", () => {
		const html = `<html><head><script type="application/ld+json">${JSON.stringify({
			"@context": "https://schema.org",
			"@graph": [
				{ "@type": "WebSite", name: "x" },
				{ "@type": "Product", name: "Karmnik XL" },
			],
		})}</script></head><body><h1>Karmnik</h1></body></html>`;
		const { structure } = htmlToMarkdown({ url: "https://x.com/k", html });
		expect(structure.signals?.product?.name).toBe("Karmnik XL");
	});
});
