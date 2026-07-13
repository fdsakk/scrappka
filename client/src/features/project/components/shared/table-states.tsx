import { Empty } from "#/components/ui/empty";

export function TableEmpty({ message }: { message: string }) {
	return (
		<Empty className="rounded-xl border">
			<p className="text-sm text-muted-foreground">{message}</p>
		</Empty>
	);
}

export function TableNoResults() {
	return (
		<p className="px-3 py-6 text-center text-sm text-muted-foreground">
			Brak wyników dla filtra.
		</p>
	);
}
