import { describe, expect, it } from "vitest";
import { pageDownloadUrl, pagePreviewUrl, parseJobId } from "./api";

describe("api url helpers", () => {
	it("builds encoded page download and preview urls", () => {
		expect(pageDownloadUrl("example.com/2026", "/about", "raw.md")).toBe(
			"/api/page-download?job=example.com%2F2026&slug=%2Fabout&file=raw.md",
		);
		expect(pagePreviewUrl("example.com/2026", "/about", "raw.md")).toBe(
			"/api/page-preview?job=example.com%2F2026&slug=%2Fabout&file=raw.md",
		);
	});

	it("parses job ids into route params", () => {
		expect(parseJobId("example.com/20260507-120000")).toEqual({
			host: "example.com",
			timestamp: "20260507-120000",
		});
	});

	it("rejects malformed job ids", () => {
		expect(() => parseJobId("example.com")).toThrow("Invalid job id");
		expect(() => parseJobId("/timestamp")).toThrow("Invalid job id");
	});
});
