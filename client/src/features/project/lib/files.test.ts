import { describe, expect, it } from "vitest";
import { fileKind, groupFiles, visibleFiles } from "./files";

describe("project file helpers", () => {
	it("hides internal project files", () => {
		expect(
			visibleFiles([
				"metadata.json",
				"home.md",
				"sitemap.json",
				"home.html",
				"raw.md",
			]),
		).toEqual(["home.md", "home.html"]);
	});

	it("classifies generated files by extension", () => {
		expect(fileKind("about.md")).toBe("md");
		expect(fileKind("about.html")).toBe("html");
		expect(fileKind("about.tsx")).toBe("tsx");
		expect(fileKind("notes.txt")).toBe("other");
	});

	it("groups only visible files", () => {
		expect(
			groupFiles([
				"metadata.json",
				"home.md",
				"home.html",
				"home.tsx",
				"notes.txt",
			]),
		).toEqual({
			md: ["home.md"],
			html: ["home.html"],
			tsx: ["home.tsx"],
			other: ["notes.txt"],
		});
	});

	it("keeps nested OpenSpec markdown files visible", () => {
		expect(
			groupFiles([
				"openspec/changes/rebuild-scraped-site/proposal.md",
				"openspec/changes/rebuild-scraped-site/specs/site-rebuild/spec.md",
			]).md,
		).toEqual([
			"openspec/changes/rebuild-scraped-site/proposal.md",
			"openspec/changes/rebuild-scraped-site/specs/site-rebuild/spec.md",
		]);
	});
});
