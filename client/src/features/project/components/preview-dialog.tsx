import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogTitle,
} from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";

export type PreviewKind = "html" | "markdown" | "code";

type PreviewState =
	| { status: "loading" }
	| { status: "ready"; content: string; safeHtml?: string }
	| { status: "error"; error: string };

export function PreviewDialog({
	open,
	onOpenChange,
	title,
	kind,
	url,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	kind: PreviewKind;
	url: string;
}) {
	const isHtml = kind === "html";
	const [state, setState] = useState<PreviewState>({ status: "loading" });

	useEffect(() => {
		if (!open) return;
		const ctrl = new AbortController();
		setState({ status: "loading" });
		(async () => {
			try {
				const res = await fetch(url, { signal: ctrl.signal });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const content = await res.text();
				if (kind === "markdown") {
					const [{ marked }, { default: DOMPurify }] = await Promise.all([
						import("marked"),
						import("dompurify"),
					]);
					const rawHtml = marked.parse(content, { async: false }) as string;
					const safeHtml = DOMPurify.sanitize(rawHtml);
					setState({ status: "ready", content, safeHtml });
				} else {
					setState({ status: "ready", content });
				}
			} catch (err: unknown) {
				if (ctrl.signal.aborted) return;
				const message = err instanceof Error ? err.message : "Failed to load";
				setState({ status: "error", error: message });
			}
		})();
		return () => ctrl.abort();
	}, [url, kind, open]);

	const canCopy = state.status === "ready";
	const copyText = canCopy ? state.content : "";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPopup
				className={isHtml ? "h-[92vh] w-[95vw] max-w-[1600px]" : "max-w-5xl"}
			>
				<DialogHeader className="flex flex-row items-center justify-start gap-5">
					<DialogTitle>{title}</DialogTitle>
					<CopyButton text={copyText} disabled={!canCopy} />
				</DialogHeader>
				<DialogPanel
					className={isHtml ? "flex min-h-0 flex-1 flex-col" : "min-h-[60vh]"}
				>
					{open ? <PreviewBody kind={kind} state={state} /> : null}
				</DialogPanel>
			</DialogPopup>
		</Dialog>
	);
}

function CopyButton({ text, disabled }: { text: string; disabled: boolean }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(t);
	}, [copied]);

	async function handleCopy() {
		if (disabled) return;
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
		} catch {}
	}

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={handleCopy}
			disabled={disabled}
		>
			{copied ? (
				<CheckIcon data-icon="inline-start" />
			) : (
				<CopyIcon data-icon="inline-start" />
			)}
			{copied ? "Skopiowano" : "Kopiuj"}
		</Button>
	);
}

function PreviewBody({
	kind,
	state,
}: {
	kind: PreviewKind;
	state: PreviewState;
}) {
	if (state.status === "loading") {
		return (
			<div className="flex h-[60vh] items-center justify-center text-muted-foreground">
				<Spinner />
			</div>
		);
	}
	if (state.status === "error") {
		return (
			<div className="flex h-[60vh] items-center justify-center text-sm text-destructive">
				{state.error}
			</div>
		);
	}

	if (kind === "html") {
		return (
			<iframe
				title="Podgląd HTML"
				srcDoc={state.content}
				sandbox=""
				className="h-full min-h-[83.5vh] w-full flex-1 rounded-md border bg-white"
			/>
		);
	}

	if (kind === "markdown") {
		return (
			<div
				className="markdown-preview"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: content sanitized via DOMPurify
				dangerouslySetInnerHTML={{ __html: state.safeHtml ?? "" }}
			/>
		);
	}

	return (
		<pre className="max-h-[83.5vh] overflow-auto rounded-md bg-muted p-4 text-xs">
			<code>{state.content}</code>
		</pre>
	);
}
