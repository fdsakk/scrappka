import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogPopup,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	ContextMenu,
	ContextMenuItem,
	ContextMenuPopup,
	ContextMenuTrigger,
} from "#/components/ui/context-menu";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { visibleFiles } from "#/features/project/lib/files";
import { api, hostFor, parseJobId } from "#/lib/api";
import type { ProjectListItem } from "#/lib/types";

export function ProjectsList({
	isLoading,
	projects,
}: {
	isLoading: boolean;
	projects: ProjectListItem[];
}) {
	const queryClient = useQueryClient();
	const [pendingDelete, setPendingDelete] = useState<ProjectListItem | null>(
		null,
	);

	const deleteMutation = useMutation({
		mutationFn: async (jobId: string) => {
			const { host, timestamp } = parseJobId(jobId);
			await api(
				`/api/app/projects/${encodeURIComponent(host)}/${encodeURIComponent(timestamp)}`,
				{ method: "DELETE" },
			);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["projects"] });
			setPendingDelete(null);
		},
	});

	if (isLoading) {
		return (
			<div className="grid gap-2">
				<Skeleton className="h-12 rounded-md" />
				<Skeleton className="h-12 rounded-md" />
				<Skeleton className="h-12 rounded-md" />
			</div>
		);
	}

	if (projects.length === 0) {
		return <p className="text-sm text-muted-foreground">Brak projektów.</p>;
	}

	const sorted = projects
		.map((project) => ({
			project,
			fileCount: visibleFiles(project.files).length,
			params: parseJobId(project.id),
		}))
		.sort((a, b) => {
			if (a.fileCount > 0 !== b.fileCount > 0) {
				return a.fileCount > 0 ? -1 : 1;
			}
			return a.project.source.length - b.project.source.length;
		});

	return (
		<>
			<ul className="grid gap-2">
				{sorted.map(({ project, fileCount, params }) => {
					const { host, timestamp } = params;
					return (
						<li key={project.id}>
							<ContextMenu>
								<ContextMenuTrigger
									render={
										<Link
											to="/$host/$timestamp"
											params={{ host, timestamp }}
											className="flex h-full items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent"
										>
											<span className="min-w-0 flex-1 truncate text-sm">
												<span className="font-medium">
													{hostFor(project.source)}
												</span>
												<span className="ml-2 text-muted-foreground">
													{project.source.replace(/^https?:\/\//, "")}
												</span>
											</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{fileCount} pliki
											</span>
										</Link>
									}
								/>
								<ContextMenuPopup>
									<ContextMenuItem
										variant="destructive"
										onClick={() => setPendingDelete(project)}
									>
										<Trash2Icon />
										Usuń projekt
									</ContextMenuItem>
								</ContextMenuPopup>
							</ContextMenu>
						</li>
					);
				})}
			</ul>

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
						deleteMutation.reset();
					}
				}}
			>
				<AlertDialogPopup>
					<AlertDialogHeader>
						<AlertDialogTitle>Usunąć projekt?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete
								? `Usuniesz wszystkie dane projektu ${hostFor(pendingDelete.source)}. Operacja nieodwracalna.`
								: ""}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogClose
							render={
								<Button variant="outline" disabled={deleteMutation.isPending}>
									Anuluj
								</Button>
							}
						/>
						<Button
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
							}}
						>
							{deleteMutation.isPending ? <Spinner /> : <Trash2Icon />}
							Usuń
						</Button>
					</AlertDialogFooter>
				</AlertDialogPopup>
			</AlertDialog>
		</>
	);
}
