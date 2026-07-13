import { createFileRoute, Link } from "@tanstack/react-router";
import { ErrorAlert } from "#/components/result-alerts";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import {
	MappingStatusAlert,
	ProjectBody,
	ProjectHeader,
	useProjectData,
	useProjectMutations,
	useScrape,
} from "#/features/project";

export const Route = createFileRoute("/$host/$timestamp")({
	component: ProjectPage,
});

function ProjectPage() {
	const { host, timestamp } = Route.useParams();
	const jobId = `${host}/${timestamp}`;

	const project = useProjectData(jobId);
	const projectQuery = project.projectQuery;
	const projectData = projectQuery.data;

	const {
		project: liveProjectData,
		startScrape,
		mapping,
	} = useScrape(jobId, projectData);
	const { remapMutation } = useProjectMutations(jobId);

	if (projectQuery.isLoading) {
		return (
			<main className="mx-auto flex max-w-5xl items-center justify-center px-4 py-16">
				<Spinner />
			</main>
		);
	}

	if (projectQuery.error || !projectData) {
		return (
			<main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
				<ErrorAlert
					message={projectQuery.error?.message ?? "Project not found"}
				/>
				<Button render={<Link to="/">Strona główna</Link>} />
			</main>
		);
	}

	const liveProject = liveProjectData ?? projectData;
	const mappingState = mapping ?? projectData.mapping;

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
			<ProjectHeader
				source={projectData.source}
				onRemap={
					mappingState.status === "mapping"
						? undefined
						: () => remapMutation.mutate()
				}
				remapping={remapMutation.isPending}
			/>

			{mappingState.status === "failed" ? (
				<ErrorAlert
					message={`Mapowanie nie powiodło się: ${mappingState.error ?? "nieznany błąd"}`}
				/>
			) : null}

			<ProjectBody
				project={liveProject}
				jobId={jobId}
				onScrapePages={startScrape}
			/>

			{mappingState.status === "mapping" ? (
				<MappingStatusAlert mapping={mappingState} jobId={jobId} />
			) : null}
		</main>
	);
}
