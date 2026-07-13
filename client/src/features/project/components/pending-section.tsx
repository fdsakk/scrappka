import { Card, CardContent } from "#/components/ui/card";
import type { PageKind } from "#/lib/types";
import type { PageRow } from "../lib/status";
import { PendingPagesTable } from "./pending-pages-table";
import { KindFilterChips } from "./shared/kind-filter-chips";

export function PendingSection({
	rows,
	onScrape,
	filter,
	kindCounts,
	activeKinds,
	onToggleKind,
}: {
	rows: PageRow[];
	onScrape: (slugs: string[]) => void;
	filter: string;
	kindCounts: Record<PageKind, number>;
	activeKinds: ReadonlySet<PageKind>;
	onToggleKind: (kind: PageKind) => void;
}) {
	if (rows.length === 0) return null;
	return (
		<Card>
			<CardContent className="flex flex-col">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-row gap-3 items-end ">
						<h2 className="text-xl font-medium">Oczekujace</h2>
					</div>
					<KindFilterChips
						counts={kindCounts}
						active={activeKinds}
						onToggle={onToggleKind}
					/>
				</div>

				<section className="flex flex-col gap-2">
					<PendingPagesTable
						rows={rows}
						onScrape={onScrape}
						filter={filter}
						activeKinds={activeKinds}
					/>
				</section>
			</CardContent>
		</Card>
	);
}
