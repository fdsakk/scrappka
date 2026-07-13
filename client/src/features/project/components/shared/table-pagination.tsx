import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsDownUpIcon,
	ChevronsUpDownIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

export function usePagination<T>(
	items: T[],
	pageSize = 10,
	resetKey?: unknown,
): {
	page: number;
	setPage: (n: number) => void;
	pageSize: number;
	totalPages: number;
	paged: T[];
	expanded: boolean;
	setExpanded: (next: boolean) => void;
} {
	const [page, setPage] = useState(1);
	const [expanded, setExpanded] = useState(false);
	const totalPages = expanded
		? 1
		: Math.max(1, Math.ceil(items.length / pageSize));

	useEffect(() => {
		void resetKey;
		setPage(1);
	}, [resetKey]);

	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	const paged = useMemo(() => {
		if (expanded) return items;
		const start = (page - 1) * pageSize;
		return items.slice(start, start + pageSize);
	}, [items, page, pageSize, expanded]);

	return { page, setPage, pageSize, totalPages, paged, expanded, setExpanded };
}

function PageNumberInput({
	page,
	totalPages,
	onPageChange,
}: {
	page: number;
	totalPages: number;
	onPageChange: (n: number) => void;
}) {
	const [draft, setDraft] = useState(String(page));

	useEffect(() => {
		setDraft(String(page));
	}, [page]);

	function commit() {
		const parsed = Number.parseInt(draft, 10);
		if (Number.isNaN(parsed)) {
			setDraft(String(page));
			return;
		}
		const clamped = Math.min(Math.max(parsed, 1), totalPages);
		setDraft(String(clamped));
		onPageChange(clamped);
	}

	return (
		<Input
			type="number"
			min={1}
			max={totalPages}
			value={draft}
			onChange={(e) => setDraft(e.currentTarget.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") commit();
			}}
			size="sm"
			className="w-14 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			aria-label="Numer strony"
		/>
	);
}

export function TablePagination({
	page,
	pageSize,
	total,
	totalPages,
	onPageChange,
	expanded,
	onExpandedChange,
}: {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
	onPageChange: (n: number) => void;
	expanded?: boolean;
	onExpandedChange?: (next: boolean) => void;
}) {
	if (total <= pageSize) return null;
	const start = (page - 1) * pageSize + 1;
	const end = Math.min(page * pageSize, total);
	return (
		<div className="flex items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
			<span>
				{expanded ? `Wszystkie (${total})` : `${start}–${end} z ${total}`}
			</span>
			<div className="flex items-center gap-2">
				{!expanded ? (
					<>
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={() => onPageChange(page - 1)}
							disabled={page <= 1}
							aria-label="Poprzednia strona"
						>
							<ChevronLeftIcon />
						</Button>
						<span className="flex items-center gap-1.5">
							<PageNumberInput
								page={page}
								totalPages={totalPages}
								onPageChange={onPageChange}
							/>
							/ {totalPages}
						</span>
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={() => onPageChange(page + 1)}
							disabled={page >= totalPages}
							aria-label="Następna strona"
						>
							<ChevronRightIcon />
						</Button>
					</>
				) : null}
				{onExpandedChange ? (
					<Button
						size="sm"
						variant="ghost"
						onClick={() => onExpandedChange(!expanded)}
					>
						{expanded ? (
							<>
								<ChevronsDownUpIcon data-icon="inline-start" />
								Pokaż strony
							</>
						) : (
							<>
								<ChevronsUpDownIcon data-icon="inline-start" />
								Rozwiń wszystko
							</>
						)}
					</Button>
				) : null}
			</div>
		</div>
	);
}
