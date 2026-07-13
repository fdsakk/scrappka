import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";

export function useProjectMutations(jobId: string) {
	const queryClient = useQueryClient();

	const remapMutation = useMutation({
		mutationFn: () =>
			api<{ started: boolean }>(`/api/app/site/${jobId}/map/again`, {
				method: "POST",
			}),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: ["project", jobId] }),
	});

	return { remapMutation };
}
