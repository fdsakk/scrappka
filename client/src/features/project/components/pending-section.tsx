import { useState } from "react";
import { Card, CardContent } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
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
	const [showFailed, setShowFailed] = useState(true);
	const failedCount = rows.filter((r) => r.page.status === "failed").length;

	if (rows.length === 0) return null;
	return (
		<Card>
			<CardContent className="flex flex-col">
				<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 max-md:grid-cols-1">
					<h2 className="text-xl font-medium">Oczekujace</h2>
					<div className="flex flex-wrap items-center justify-center">
						<KindFilterChips
							counts={kindCounts}
							active={activeKinds}
							onToggle={onToggleKind}
						/>
					</div>
					<div className="flex justify-end">
						{failedCount > 0 ? (
							<label
								htmlFor="show-failed-toggle"
								className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
							>
								<Checkbox
									id="show-failed-toggle"
									checked={showFailed}
									onCheckedChange={(value) => setShowFailed(value === true)}
								/>
								Pokazuj błędy ({failedCount})
							</label>
						) : null}
					</div>
				</div>

				<section className="flex flex-col gap-2">
					<PendingPagesTable
						rows={rows}
						onScrape={onScrape}
						filter={filter}
						activeKinds={activeKinds}
						showFailed={showFailed}
					/>
				</section>
			</CardContent>
		</Card>
	);
}
