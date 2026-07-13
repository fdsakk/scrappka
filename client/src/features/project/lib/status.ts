import type { PageKind, PageMetadata, PageStatus } from "#/lib/types";

export const STATUS_LABEL: Record<PageStatus, string> = {
	pending: "Oczekuje",
	scraping: "Scrapuje",
	done: "Gotowe",
	failed: "Błąd",
	skipped: "Bez zmian",
};

export const STATUS_VARIANT: Record<
	PageStatus,
	"default" | "secondary" | "destructive" | "info" | "error"
> = {
	pending: "secondary",
	scraping: "info",
	done: "default",
	failed: "destructive",
	skipped: "secondary",
};

export type PageRow = { slug: string; page: PageMetadata };

export function errorHttpStatus(page: PageMetadata): number | null {
	if (page.status !== "failed" || !page.error) return null;
	const match = page.error.match(/\bHTTP (\d{3})\b/);
	return match ? Number(match[1]) : null;
}

export function partitionPages(pages: Record<string, PageMetadata>): {
	doneRows: PageRow[];
	pendingRows: PageRow[];
} {
	const doneRows: PageRow[] = [];
	const pendingRows: PageRow[] = [];
	for (const [slug, page] of Object.entries(pages)) {
		if (page.status === "done" || page.status === "skipped") {
			doneRows.push({ slug, page });
		} else {
			pendingRows.push({ slug, page });
		}
	}
	return { doneRows, pendingRows };
}

export const PAGE_KINDS: readonly PageKind[] = [
	"content",
	"listing",
	"image",
	"document",
	"asset",
];

export const KIND_LABEL: Record<PageKind, string> = {
	content: "Treść",
	listing: "Listingi",
	image: "Obrazy",
	document: "Dokumenty",
	asset: "Zasoby",
};

export function kindOf(page: PageMetadata): PageKind {
	return page.kind ?? "content";
}

export function countByKind(rows: PageRow[]): Record<PageKind, number> {
	const counts: Record<PageKind, number> = {
		content: 0,
		listing: 0,
		image: 0,
		document: 0,
		asset: 0,
	};
	for (const row of rows) counts[kindOf(row.page)]++;
	return counts;
}

export function filterRows(
	rows: PageRow[],
	filter: string,
	kinds?: ReadonlySet<PageKind>,
): PageRow[] {
	const needle = filter.toLowerCase();
	return rows.filter((r) => {
		if (kinds && !kinds.has(kindOf(r.page))) return false;
		if (needle && !r.page.url.toLowerCase().includes(needle)) return false;
		return true;
	});
}
