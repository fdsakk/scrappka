import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ProjectsList } from "#/components/projects-list";
import { ErrorAlert } from "#/components/result-alerts";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { api } from "#/lib/api";
import type { ProjectsResponse, StartMapResponse } from "#/lib/types";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [url, setUrl] = useState("");

	const projectsQuery = useQuery({
		queryKey: ["projects"],
		queryFn: () => api<ProjectsResponse>("/api/app/projects"),
	});

	const mapMutation = useMutation({
		mutationFn: (nextUrl: string) =>
			api<StartMapResponse>("/api/app/site/map", {
				method: "POST",
				body: JSON.stringify({ url: nextUrl }),
			}),
		onSuccess: async ({ host, timestamp }) => {
			await queryClient.invalidateQueries({ queryKey: ["projects"] });
			navigate({
				to: "/$host/$timestamp",
				params: { host, timestamp },
				search: {},
			});
		},
	});

	function handleMap(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		mapMutation.mutate(url);
	}

	const projects = projectsQuery.data?.projects ?? [];

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-12 px-8 py-16">
			<section className="gap-4 flex flex-col">
				<header>
					<h1 className="text-2xl font-semibold tracking-tight">Scrappka</h1>
				</header>
				<Card>
					<CardContent>
						<form className="flex gap-2" onSubmit={handleMap}>
							<Input
								aria-label="URL"
								className="flex-1"
								disabled={mapMutation.isPending}
								nativeInput
								onChange={(e) => setUrl(e.target.value)}
								placeholder="https://example.com"
								required
								type="url"
								value={url}
							/>
							<Button disabled={mapMutation.isPending || !url} type="submit">
								{mapMutation.isPending ? (
									<Spinner />
								) : (
									<SearchIcon data-icon="inline-start" />
								)}
								Mapuj
							</Button>
						</form>
						{mapMutation.error ? (
							<div className="mt-3">
								<ErrorAlert message={mapMutation.error.message} />
							</div>
						) : null}
					</CardContent>
				</Card>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-sm font-medium text-muted-foreground">Projekty</h2>
				<ProjectsList isLoading={projectsQuery.isLoading} projects={projects} />
			</section>
		</main>
	);
}
