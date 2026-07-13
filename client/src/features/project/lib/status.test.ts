import { describe, expect, it } from "vitest";
import type { PageMetadata } from "#/lib/types";
import { filterRows, partitionPages } from "./status";

const pages: Record<string, PageMetadata> = {
	home: { url: "https://example.com", status: "done" },
	about: { url: "https://example.com/about", status: "pending" },
	failed: { url: "https://example.com/fail", status: "failed" },
	skipped: { url: "https://example.com/old", status: "skipped" },
};

describe("page status helpers", () => {
	it("partitions done and pending rows", () => {
		expect(partitionPages(pages)).toEqual({
			doneRows: [
				{ slug: "home", page: pages.home },
				{ slug: "skipped", page: pages.skipped },
			],
			pendingRows: [
				{ slug: "about", page: pages.about },
				{ slug: "failed", page: pages.failed },
			],
		});
	});

	it("filters rows case-insensitively by url", () => {
		const rows = partitionPages(pages).pendingRows;
		expect(filterRows(rows, "ABOUT")).toEqual([
			{ slug: "about", page: pages.about },
		]);
	});

	it("filters rows by active kinds, treating missing kind as content", () => {
		const rows = [
			{
				slug: "post",
				page: { url: "https://x.com/post", status: "pending", kind: "content" },
			},
			{
				slug: "img",
				page: { url: "https://x.com/a.jpg", status: "pending", kind: "image" },
			},
			{ slug: "legacy", page: { url: "https://x.com/old", status: "pending" } },
		] satisfies { slug: string; page: PageMetadata }[];

		expect(filterRows(rows, "", new Set(["content"]))).toEqual([
			rows[0],
			rows[2],
		]);
		expect(filterRows(rows, "", new Set(["image"]))).toEqual([rows[1]]);
		expect(filterRows(rows, "a.jpg", new Set(["content", "image"]))).toEqual([
			rows[1],
		]);
	});
});
