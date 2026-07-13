import { BookOpenIcon } from "lucide-react";
import { useState } from "react";
import { ErrorAlert } from "#/components/result-alerts";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Spinner } from "#/components/ui/spinner";
import type { PageRow } from "../lib/status";
import { DonePagesTable } from "./done-pages-table";
import { PageSearchInput } from "./shared/page-search-input";

export function PagesSection({
	jobId,
	doneRows,
	pendingRows,
	filter,
	onFilterChange,
}: {
	jobId: string;
	doneRows: PageRow[];
	pendingRows: PageRow[];
	filter: string;
	onFilterChange: (filter: string) => void;
}) {
	const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
	const [knowledgePending, setKnowledgePending] = useState(false);

	async function downloadKnowledge() {
		setKnowledgePending(true);
		setKnowledgeError(null);
		try {
			const response = await fetch(`/api/app/site/${jobId}/knowledge/zip`);
			if (!response.ok) {
				const payload = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(payload.error ?? "Nie udało się pobrać bazy wiedzy");
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `knowledge-${jobId.replace("/", "-")}.zip`;
			anchor.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			setKnowledgeError(err instanceof Error ? err.message : String(err));
		} finally {
			setKnowledgePending(false);
		}
	}

	return (
		<Card>
			<CardContent className="flex flex-col gap-5">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="flex flex-row items-end gap-3">
						<h2 className="text-xl font-medium">Podstrony</h2>
						<h3 className="text-base text-muted-foreground">
							{doneRows.length}/{pendingRows.length + doneRows.length}
						</h3>
					</div>
					<div className="grid w-full grid-cols-[minmax(0,20rem)_auto] items-center justify-end gap-2 md:w-auto">
						<PageSearchInput value={filter} onChange={onFilterChange} />
						<Button
							className="whitespace-nowrap"
							size="sm"
							variant="outline"
							title="Pobierz bazę wiedzy + PROMPT.md do wygenerowania OpenSpeca lokalnym LLM"
							onClick={downloadKnowledge}
							disabled={knowledgePending}
						>
							{knowledgePending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<BookOpenIcon data-icon="inline-start" />
							)}
							Baza wiedzy (ZIP)
						</Button>
					</div>
				</div>

				{knowledgeError ? <ErrorAlert message={knowledgeError} /> : null}

				<section className="flex flex-col gap-2">
					<DonePagesTable jobId={jobId} rows={doneRows} filter={filter} />
				</section>
			</CardContent>
		</Card>
	);
}
