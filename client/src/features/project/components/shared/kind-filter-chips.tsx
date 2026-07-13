import type { PageKind } from "#/lib/types";
import { cn } from "#/lib/utils";
import { KIND_LABEL, PAGE_KINDS } from "../../lib/status";

export function KindFilterChips({
	counts,
	active,
	onToggle,
}: {
	counts: Record<PageKind, number>;
	active: ReadonlySet<PageKind>;
	onToggle: (kind: PageKind) => void;
}) {
	const visible = PAGE_KINDS.filter(
		(kind) => counts[kind] > 0 || active.has(kind),
	);
	if (visible.length <= 1) return null;

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{visible.map((kind) => {
				const isActive = active.has(kind);
				return (
					<button
						key={kind}
						type="button"
						onClick={() => onToggle(kind)}
						aria-pressed={isActive}
						className={cn(
							"rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
							isActive
								? "border-foreground/30 bg-foreground/10 text-foreground"
								: "border-border text-muted-foreground hover:text-foreground",
						)}
					>
						{KIND_LABEL[kind]} ({counts[kind]})
					</button>
				);
			})}
		</div>
	);
}
