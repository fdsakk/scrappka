import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { api } from "#/lib/api";
import type { MappingMetadata } from "#/lib/types";

const STALE_AFTER_MS = 30_000;

const PHASE_LABEL = {
	sitemap: "czytam sitemap",
	crawl: "crawluję linki",
} as const;

/** Path + query only — the host is already obvious from the project context. */
function shortPath(url: string): string {
	try {
		const u = new URL(url);
		return u.pathname + u.search || "/";
	} catch {
		return url;
	}
}

export function MappingStatusAlert({
	mapping,
	jobId,
}: {
	mapping: MappingMetadata;
	jobId: string;
}) {
	const queryClient = useQueryClient();
	const [now, setNow] = useState(() => Date.now());
	const [cancelling, setCancelling] = useState(false);

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 5000);
		return () => clearInterval(timer);
	}, []);

	const activity = mapping.activity;
	const idleMs = activity ? now - Date.parse(activity.updatedAt) : 0;
	const isStale = activity != null && idleMs > STALE_AFTER_MS;

	// Stopping keeps whatever pages were already discovered (server finalizes as
	// `cancelled`, not `failed`), so the user can scrape them right away.
	const stop = async () => {
		setCancelling(true);
		try {
			await api(`/api/app/site/${jobId}/map/cancel`, { method: "POST" });
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["project", jobId] }),
				queryClient.invalidateQueries({ queryKey: ["tree", jobId] }),
				queryClient.invalidateQueries({ queryKey: ["projects"] }),
			]);
		} finally {
			setCancelling(false);
		}
	};

	return (
		<Alert
			variant="info"
			className="fixed right-4 bottom-4 z-50 w-80 shadow-lg backdrop-blur"
		>
			<Spinner />
			<AlertTitle>Mapuję podstrony ({mapping.discovered})</AlertTitle>
			<AlertDescription className="flex min-w-0 flex-col gap-2 text-xs">
				<div className="flex min-w-0 flex-col gap-0.5">
					{activity ? (
						<>
							<span>Faza: {PHASE_LABEL[activity.phase]}</span>
							{activity.lastUrl ? (
								<span className="block truncate" title={activity.lastUrl}>
									{shortPath(activity.lastUrl)}
								</span>
							) : null}
							{activity.fetchErrors > 0 ? (
								<span
									className="flex items-center gap-1 truncate text-amber-600 dark:text-amber-400"
									title={activity.lastError?.message}
								>
									<TriangleAlertIcon className="size-3 shrink-0" />
									<span className="truncate">
										Błędy pobierania: {activity.fetchErrors}
										{activity.lastError
											? ` · ${activity.lastError.message.split(" for ")[0]}`
											: ""}
									</span>
								</span>
							) : null}
							{isStale ? (
								<span className="text-amber-600 dark:text-amber-400">
									Brak aktywności od {Math.round(idleMs / 1000)}s — możliwe, że
									serwer ogranicza żądania
								</span>
							) : null}
						</>
					) : (
						<span>Uruchamiam odkrywanie adresów…</span>
					)}
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={stop}
					disabled={cancelling}
					className="self-start"
				>
					{cancelling ? <Spinner data-icon="inline-start" /> : null}
					Zatrzymaj i zachowaj strony
				</Button>
			</AlertDescription>
		</Alert>
	);
}
