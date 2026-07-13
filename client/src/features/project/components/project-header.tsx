import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { hostFor } from "#/lib/api";

function displayHostFor(source: string): string {
	return hostFor(source).replace(/^www\./i, "");
}

export function ProjectHeader({
	source,
	onRemap,
	remapping,
}: {
	source: string;
	/** Re-run discovery on this job. Hidden while a mapping is already active. */
	onRemap?: () => void;
	remapping?: boolean;
}) {
	return (
		<header className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-3">
			<Button
				className="ml-3 mt-3"
				aria-label="Wróć"
				size="icon"
				variant="ghost"
				render={<Link to="/" />}
			>
				<ArrowLeftIcon />
			</Button>
			<div className="min-w-0 text-center">
				<h1 className="truncate text-2xl font-semibold">
					{displayHostFor(source)}
				</h1>
				<a
					className="block truncate text-sm text-muted-foreground hover:text-foreground"
					href={source}
					target="_blank"
					rel="noreferrer"
				>
					{source}
				</a>
			</div>
			{onRemap ? (
				<Button
					className="mr-3 mt-3"
					aria-label="Mapuj ponownie"
					title="Mapuj ponownie"
					size="icon"
					variant="ghost"
					disabled={remapping}
					onClick={onRemap}
				>
					{remapping ? <Spinner /> : <RotateCcwIcon />}
				</Button>
			) : (
				<div aria-hidden />
			)}
		</header>
	);
}
