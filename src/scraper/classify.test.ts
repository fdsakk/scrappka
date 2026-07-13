import { describe, expect, test } from "bun:test";
import { classifyUrl } from "./classify.ts";

describe("classifyUrl", () => {
  test("plain pages are content", () => {
    expect(classifyUrl("https://example.com")).toBe("content");
    expect(classifyUrl("https://example.com/about")).toBe("content");
    expect(classifyUrl("https://example.com/blog/my-post")).toBe("content");
    expect(classifyUrl("https://example.com/docs/getting-started.html")).toBe("content");
    expect(classifyUrl("https://example.com/index.php")).toBe("content");
  });

  test("images by extension", () => {
    expect(classifyUrl("https://example.com/uploads/photo.jpg")).toBe("image");
    expect(classifyUrl("https://example.com/logo.SVG")).toBe("image");
    expect(classifyUrl("https://example.com/img/pic.webp")).toBe("image");
  });

  test("documents by extension", () => {
    expect(classifyUrl("https://example.com/report.pdf")).toBe("document");
    expect(classifyUrl("https://example.com/data.csv")).toBe("document");
  });

  test("assets by extension", () => {
    expect(classifyUrl("https://example.com/app.js")).toBe("asset");
    expect(classifyUrl("https://example.com/style.css")).toBe("asset");
    expect(classifyUrl("https://example.com/archive.zip")).toBe("asset");
    expect(classifyUrl("https://example.com/sitemap.xml")).toBe("asset");
    expect(classifyUrl("https://example.com/video.mp4")).toBe("asset");
  });

  test("unknown extension stays content", () => {
    expect(classifyUrl("https://example.com/page.aspx")).toBe("content");
  });

  test("tag/category/author/archive paths are listing", () => {
    expect(classifyUrl("https://example.com/tag/react")).toBe("listing");
    expect(classifyUrl("https://example.com/blog/category/news")).toBe("listing");
    expect(classifyUrl("https://example.com/author/jan")).toBe("listing");
    expect(classifyUrl("https://example.com/archives")).toBe("listing");
    expect(classifyUrl("https://example.com/feed")).toBe("listing");
    expect(classifyUrl("https://example.com/wp-json/wp/v2/posts")).toBe("listing");
  });

  test("pagination paths are listing", () => {
    expect(classifyUrl("https://example.com/blog/page/3")).toBe("listing");
    expect(classifyUrl("https://example.com/page/12")).toBe("listing");
  });

  test("page segment without number is content", () => {
    expect(classifyUrl("https://example.com/page/about-us")).toBe("content");
  });

  test("date archives are listing", () => {
    expect(classifyUrl("https://example.com/2023")).toBe("listing");
    expect(classifyUrl("https://example.com/2023/05")).toBe("listing");
  });

  test("dated permalink with slug is content", () => {
    expect(classifyUrl("https://example.com/2023/05/my-post")).toBe("content");
  });

  test("residual query params are listing", () => {
    expect(classifyUrl("https://example.com/products?sort=price")).toBe("listing");
    expect(classifyUrl("https://example.com/blog?page=2")).toBe("listing");
  });

  test("query on binary URL keeps extension kind", () => {
    expect(classifyUrl("https://example.com/photo.jpg?w=800")).toBe("image");
  });

  test("invalid URL falls back to content", () => {
    expect(classifyUrl("not-a-url")).toBe("content");
  });
});
