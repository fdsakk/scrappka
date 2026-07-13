import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "#/lib/api";
import { useSse } from "#/lib/sse";
import type { JobSummary, ScrapeStatusResponse } from "#/lib/types";

/** Keeps TanStack Query as the single project-state store and streams server snapshots into it. */
export function useScrape(jobId: string, baseJob: JobSummary | undefined) {
	const queryClient = useQueryClient();
	const [scrapeStreamActive, setScrapeStreamActive] = useState(false);
	const mappingActive = baseJob?.mapping.status === "mapping";
	const streamUrl =
		mappingActive || scrapeStreamActive
			? `/api/app/site/${jobId}/stream`
			: null;
	const sse = useSse<ScrapeStatusResponse>(streamUrl);

	useEffect(() => {
		if (!sse.data) return;
		queryClient.setQueryData<JobSummary | undefined>(
			["project", jobId],
			(previous) =>
				previous
					? {
							...previous,
							mapping: sse.data?.mapping ?? previous.mapping,
							pages: sse.data?.pages ?? previous.pages,
						}
					: previous,
		);
	}, [sse.data, queryClient, jobId]);

	useEffect(() => {
		if (!sse.done) return;
		setScrapeStreamActive(false);
		void Promise.all([
			queryClient.invalidateQueries({ queryKey: ["project", jobId] }),
			queryClient.invalidateQueries({ queryKey: ["projects"] }),
			queryClient.invalidateQueries({ queryKey: ["tree", jobId] }),
		]);
	}, [sse.done, queryClient, jobId]);

	const scrapeMutation = useMutation({
		mutationFn: (slugs: string[]) =>
			api<{ accepted: boolean }>(`/api/app/site/${jobId}/scrape`, {
				method: "POST",
				body: JSON.stringify({ slugs }),
			}),
		onSuccess: (_response, slugs) => {
			queryClient.setQueryData<JobSummary | undefined>(
				["project", jobId],
				(previous) => {
					if (!previous) return previous;
					const pages = { ...previous.pages };
					for (const slug of slugs) {
						const page = pages[slug];
						if (page)
							pages[slug] = { ...page, status: "scraping", error: undefined };
					}
					return { ...previous, pages };
				},
			);
			setScrapeStreamActive(true);
		},
		onError: () => {
			void queryClient.invalidateQueries({ queryKey: ["project", jobId] });
		},
	});

	return {
		scraping: scrapeMutation.isPending || scrapeStreamActive,
		mapping: sse.data?.mapping ?? baseJob?.mapping,
		project:
			sse.data && baseJob
				? { ...baseJob, mapping: sse.data.mapping, pages: sse.data.pages }
				: baseJob,
		startScrape: (slugs: string[]) => {
			if (slugs.length > 0) scrapeMutation.mutate(slugs);
		},
		isPending: scrapeMutation.isPending,
	};
}
