import { useEffect, useState } from "react";

export interface SseStatusPayload<T> {
	data: T | null;
	done: boolean;
	error: string | null;
}

export function useSse<T>(url: string | null): SseStatusPayload<T> {
	const [data, setData] = useState<T | null>(null);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setData(null);
		setDone(false);
		setError(null);
		if (!url) return;

		const source = new EventSource(url);
		source.addEventListener("status", (event) => {
			setError(null);
			try {
				setData(JSON.parse((event as MessageEvent).data));
			} catch {
				setError("Stream returned invalid JSON");
			}
		});
		source.addEventListener("done", () => {
			setDone(true);
			source.close();
		});
		source.addEventListener("error", (event) => {
			if (event instanceof MessageEvent && event.data) {
				try {
					const payload = JSON.parse(event.data) as { error?: string };
					setError(payload.error ?? "Stream failed");
					return;
				} catch {}
			}
			setError("Stream reconnecting");
		});

		return () => source.close();
	}, [url]);

	return { data, done, error };
}
