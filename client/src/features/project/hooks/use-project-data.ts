import { useQuery } from "@tanstack/react-query";
import { api } from "#/lib/api";
import type { JobSummary } from "#/lib/types";

export function useProjectData(jobId: string) {
	const projectQuery = useQuery({
		queryKey: ["project", jobId],
		queryFn: () =>
			api<{ project: JobSummary }>(`/api/app/projects/${jobId}`).then(
				(r) => r.project,
			),
	});

	return { projectQuery };
}
