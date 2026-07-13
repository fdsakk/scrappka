export const HIDDEN_FILES = new Set([
	"metadata.json",
	"sitemap.json",
	"raw.md",
]);

export type ProjectFileKind = "md" | "html" | "tsx" | "other";

export interface ProjectFileGroups {
	md: string[];
	html: string[];
	tsx: string[];
	other: string[];
}

export function visibleFiles(files: string[]): string[] {
	return files.filter((file) => !HIDDEN_FILES.has(file));
}

export function fileKind(file: string): ProjectFileKind {
	if (file.endsWith(".md")) return "md";
	if (file.endsWith(".html")) return "html";
	if (file.endsWith(".tsx")) return "tsx";
	return "other";
}

export function groupFiles(files: string[]): ProjectFileGroups {
	const groups: ProjectFileGroups = { md: [], html: [], tsx: [], other: [] };
	for (const file of visibleFiles(files)) {
		groups[fileKind(file)].push(file);
	}
	return groups;
}
