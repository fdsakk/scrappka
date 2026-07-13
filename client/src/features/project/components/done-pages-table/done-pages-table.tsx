import { DownloadIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { pageDownloadUrl, pagePreviewUrl } from "#/lib/api";
import { filterRows, type PageRow } from "../../lib/status";
import { TablePagination, usePagination } from "../shared/table-pagination";
import { TableEmpty, TableNoResults } from "../shared/table-states";

const PreviewDialog = lazy(() =>
	import("../preview-dialog").then((module) => ({
		default: module.PreviewDialog,
	})),
);

export function DonePagesTable({
	jobId,
	rows,
	filter,
}: {
	jobId: string;
	rows: PageRow[];
	filter: string;
}) {
	const sorted = useMemo(() => {
		const filtered = filterRows(rows, filter);
		return [...filtered].sort((a, b) => {
			const ta = a.page.scrapedAt ? new Date(a.page.scrapedAt).getTime() : 0;
			const tb = b.page.scrapedAt ? new Date(b.page.scrapedAt).getTime() : 0;
			return tb - ta;
		});
	}, [rows, filter]);

	const { page, setPage, pageSize, totalPages, paged, expanded, setExpanded } =
		usePagination(sorted, 10, filter);

	const [preview, setPreview] = useState<{ slug: string } | null>(null);

	if (rows.length === 0) {
		return <TableEmpty message="Brak zescrapowanych podstron." />;
	}

	if (sorted.length === 0) {
		return <TableNoResults />;
	}

	return (
		<div className="flex flex-col gap-3">
			<Table className="table-fixed" variant="card">
				<TableHeader>
					<TableRow>
						<TableHead>URL</TableHead>
						<TableHead className="w-40 text-right">Akcje</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{paged.map(({ slug, page: pageMeta }) => (
						<TableRow key={slug}>
							<TableCell className="min-w-0 max-w-0">
								<span className="block truncate text-sm">{pageMeta.url}</span>
							</TableCell>
							<TableCell className="w-40">
								<div className="flex items-center justify-end gap-1">
									<Button
										size="icon-sm"
										variant="ghost"
										title="Otwórz stronę"
										render={(props) => (
											<a
												{...props}
												href={pageMeta.url}
												target="_blank"
												rel="noreferrer"
												aria-label="Otwórz stronę"
											/>
										)}
									>
										<ExternalLinkIcon />
									</Button>
									<Button
										size="icon-sm"
										variant="ghost"
										title="Podgląd raw.md"
										aria-label="Podgląd raw.md"
										onClick={() => setPreview({ slug })}
									>
										<FileTextIcon />
									</Button>
									<Button
										size="icon-sm"
										variant="ghost"
										title="Pobierz raw.md"
										render={(props) => (
											<a
												{...props}
												href={pageDownloadUrl(jobId, slug, "raw.md")}
												aria-label="Pobierz raw.md"
											/>
										)}
									>
										<DownloadIcon />
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<TablePagination
				page={page}
				pageSize={pageSize}
				total={sorted.length}
				totalPages={totalPages}
				onPageChange={setPage}
				expanded={expanded}
				onExpandedChange={setExpanded}
			/>
			{preview ? (
				<Suspense fallback={null}>
					<PreviewDialog
						open
						onOpenChange={(open) => {
							if (!open) setPreview(null);
						}}
						title={`${preview.slug} — raw.md`}
						kind="markdown"
						url={pagePreviewUrl(jobId, preview.slug, "raw.md")}
					/>
				</Suspense>
			) : null}
		</div>
	);
}
