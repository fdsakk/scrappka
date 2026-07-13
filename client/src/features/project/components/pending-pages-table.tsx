import { ListChecksIcon, PlayIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Spinner } from "#/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { PageKind } from "#/lib/types";
import {
	errorHttpStatus,
	filterRows,
	type PageRow,
	STATUS_LABEL,
	STATUS_VARIANT,
} from "../lib/status";
import { TablePagination, usePagination } from "./shared/table-pagination";
import { TableEmpty, TableNoResults } from "./shared/table-states";

export function PendingPagesTable({
	rows,
	onScrape,
	filter,
	activeKinds,
	showFailed,
}: {
	rows: PageRow[];
	onScrape: (slugs: string[]) => void;
	filter: string;
	activeKinds: ReadonlySet<PageKind>;
	showFailed: boolean;
}) {
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const sorted = useMemo(() => {
		const filtered = filterRows(rows, filter, activeKinds).filter(
			(r) => showFailed || r.page.status !== "failed",
		);
		return [...filtered].sort((a, b) => a.page.url.length - b.page.url.length);
	}, [rows, filter, activeKinds, showFailed]);

	const resetKey = `${filter}|${[...activeKinds].sort().join(",")}|${showFailed}`;
	const {
		page: pageNum,
		setPage,
		pageSize,
		totalPages,
		paged,
		expanded,
		setExpanded,
	} = usePagination(sorted, 10, resetKey);

	const allSelectableSlugs = useMemo(
		() =>
			sorted
				.filter(
					({ page: pageMeta }) =>
						pageMeta.status === "pending" || pageMeta.status === "failed",
				)
				.map((r) => r.slug),
		[sorted],
	);
	const allSelectableSet = useMemo(
		() => new Set(allSelectableSlugs),
		[allSelectableSlugs],
	);

	// Drop stale selections when filter/status changes remove rows.
	useEffect(() => {
		setSelected((prev) => {
			let changed = false;
			const out = new Set<string>();
			for (const s of prev) {
				if (allSelectableSet.has(s)) out.add(s);
				else changed = true;
			}
			return changed ? out : prev;
		});
	}, [allSelectableSet]);

	const pageSelectableSlugs = paged
		.filter(
			({ page: pageMeta }) =>
				pageMeta.status === "pending" || pageMeta.status === "failed",
		)
		.map((r) => r.slug);
	const pageAllChecked =
		pageSelectableSlugs.length > 0 &&
		pageSelectableSlugs.every((s) => selected.has(s));
	const pageSomeChecked =
		pageSelectableSlugs.some((s) => selected.has(s)) && !pageAllChecked;

	const selectedCount = selected.size;
	const globalAllSelected =
		allSelectableSlugs.length > 0 &&
		selectedCount === allSelectableSlugs.length;

	function togglePage(next: boolean) {
		setSelected((prev) => {
			const out = new Set(prev);
			if (next) for (const s of pageSelectableSlugs) out.add(s);
			else for (const s of pageSelectableSlugs) out.delete(s);
			return out;
		});
	}

	function toggleGlobal() {
		setSelected(globalAllSelected ? new Set() : new Set(allSelectableSlugs));
	}

	function toggleOne(slug: string, next: boolean) {
		setSelected((prev) => {
			const out = new Set(prev);
			if (next) out.add(slug);
			else out.delete(slug);
			return out;
		});
	}

	function handleBulkScrape() {
		const slugs = allSelectableSlugs.filter((s) => selected.has(s));
		if (slugs.length === 0) return;
		onScrape(slugs);
		setSelected(new Set());
	}

	if (rows.length === 0) {
		return <TableEmpty message="Wszystkie podstrony zescrapowane." />;
	}

	if (sorted.length === 0) {
		return <TableNoResults />;
	}

	return (
		<div className="flex flex-col gap-3 mt-5">
			<Table className="table-fixed" variant="card">
				<TableHeader>
					<TableRow>
						<TableHead className="!w-auto !pe-2.5">
							<div className="flex items-center gap-3">
								<Checkbox
									checked={pageAllChecked}
									indeterminate={pageSomeChecked}
									onCheckedChange={(value) => togglePage(value === true)}
									disabled={pageSelectableSlugs.length === 0}
									aria-label="Zaznacz widoczne na stronie"
								/>
								<span>URL</span>
							</div>
						</TableHead>
						<TableHead className="w-52 whitespace-nowrap pe-4 text-right">
							Status
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{paged.map(({ slug, page: pageMeta }) => {
						const isFailed = pageMeta.status === "failed";
						const isScraping = pageMeta.status === "scraping";
						const httpStatus = errorHttpStatus(pageMeta);
						return (
							<TableRow
								key={slug}
								data-state={selected.has(slug) ? "selected" : undefined}
							>
								<TableCell className="!w-auto !pe-2.5">
									<div className="flex min-w-0 items-center gap-3">
										<Checkbox
											checked={selected.has(slug)}
											onCheckedChange={(value) =>
												toggleOne(slug, value === true)
											}
											disabled={isScraping}
											aria-label={`Zaznacz ${pageMeta.url}`}
										/>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm">{pageMeta.url}</p>
										</div>
									</div>
								</TableCell>
								<TableCell className="w-52 whitespace-nowrap pe-4 text-right">
									<span className="inline-flex items-center justify-end gap-1.5">
										<Badge
											variant={STATUS_VARIANT[pageMeta.status]}
											size="lg"
											title={isFailed ? pageMeta.error : undefined}
										>
											{STATUS_LABEL[pageMeta.status]}
											{httpStatus !== null ? ` ${httpStatus}` : null}
										</Badge>
										{isScraping ? <Spinner /> : null}
									</span>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell colSpan={2}>
							<TablePagination
								page={pageNum}
								pageSize={pageSize}
								total={sorted.length}
								totalPages={totalPages}
								onPageChange={setPage}
								expanded={expanded}
								onExpandedChange={setExpanded}
							/>
						</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-sm">
					<ListChecksIcon className="size-4 text-muted-foreground" />
					{selectedCount === 0 ? (
						<button
							type="button"
							onClick={toggleGlobal}
							disabled={allSelectableSlugs.length === 0}
							className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
						>
							Zaznacz wszystko ({allSelectableSlugs.length})
						</button>
					) : (
						<>
							<span className="font-medium text-foreground">
								{globalAllSelected
									? `Wszystkie zaznaczone (${selectedCount})`
									: `${selectedCount} zaznaczonych`}
							</span>
							{!globalAllSelected &&
							allSelectableSlugs.length > selectedCount ? (
								<>
									<span className="text-muted-foreground/60">·</span>
									<button
										type="button"
										onClick={toggleGlobal}
										className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
									>
										Zaznacz wszystkie ({allSelectableSlugs.length})
									</button>
								</>
							) : null}
							<span className="text-muted-foreground/60">·</span>
							<button
								type="button"
								onClick={() => setSelected(new Set())}
								className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
							>
								Wyczyść
							</button>
						</>
					)}
				</div>
				<Button
					variant="outline"
					size="lg"
					className="enabled:border-green-500/80"
					onClick={handleBulkScrape}
					disabled={selectedCount === 0}
				>
					<PlayIcon data-icon="inline-start" />
					Scrapuj zaznaczone
				</Button>
			</div>
		</div>
	);
}
