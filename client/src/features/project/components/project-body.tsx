import { useMemo, useState } from "react";
import type { JobSummary, PageKind } from "#/lib/types";
import { countByKind, partitionPages } from "../lib/status";
import { PagesSection } from "./pages-section";
import { PendingSection } from "./pending-section";

export function ProjectBody({
	project,
	jobId,
	onScrapePages,
}: {
	project: JobSummary;
	jobId: string;
	onScrapePages: (slugs: string[]) => void;
}) {
	const [filter, setFilter] = useState("");
	const [activeKinds, setActiveKinds] = useState<Set<PageKind>>(
		() => new Set<PageKind>(["content"]),
	);
	const { doneRows, pendingRows } = useMemo(
		() => partitionPages(project.pages),
		[project.pages],
	);

	const kindCounts = useMemo(() => countByKind(pendingRows), [pendingRows]);

	function toggleKind(kind: PageKind) {
		setActiveKinds((prev) => {
			const next = new Set(prev);
			if (next.has(kind)) next.delete(kind);
			else next.add(kind);
			return next;
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<PagesSection
				jobId={jobId}
				doneRows={doneRows}
				pendingRows={pendingRows}
				filter={filter}
				onFilterChange={setFilter}
			/>

			<PendingSection
				rows={pendingRows}
				onScrape={onScrapePages}
				filter={filter}
				kindCounts={kindCounts}
				activeKinds={activeKinds}
				onToggleKind={toggleKind}
			/>
		</div>
	);
}
