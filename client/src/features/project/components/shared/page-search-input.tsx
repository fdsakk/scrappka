import { SearchIcon } from "lucide-react";
import { Input } from "#/components/ui/input";

export function PageSearchInput({
	value,
	onChange,
	placeholder = "Szukaj url...",
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}) {
	return (
		<div className="relative w-full max-w-xs items-center">
			<SearchIcon
				aria-hidden
				className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="search"
				value={value}
				onChange={(e) => onChange(e.currentTarget.value)}
				placeholder={placeholder}
				className="ps-6"
				size="sm"
			/>
		</div>
	);
}
