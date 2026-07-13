export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: {
			Accept: "application/json",
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
	});
	const payload = (await response.json().catch(() => ({}))) as {
		error?: string;
	};

	if (!response.ok) {
		throw new Error(payload.error ?? "Request failed");
	}

	return payload as T;
}

export function pageDownloadUrl(
	jobId: string,
	slug: string,
	filename: string,
): string {
	return `/api/page-download?job=${encodeURIComponent(jobId)}&slug=${encodeURIComponent(slug)}&file=${encodeURIComponent(filename)}`;
}

export function pagePreviewUrl(
	jobId: string,
	slug: string,
	filename: string,
): string {
	return `/api/page-preview?job=${encodeURIComponent(jobId)}&slug=${encodeURIComponent(slug)}&file=${encodeURIComponent(filename)}`;
}

export interface JobRouteParams {
	host: string;
	timestamp: string;
}

export function parseJobId(jobId: string): JobRouteParams {
	const separator = jobId.indexOf("/");
	const host = jobId.slice(0, separator);
	const timestamp = jobId.slice(separator + 1);
	if (separator <= 0 || !timestamp) {
		throw new Error(`Invalid job id: ${jobId}`);
	}
	return { host, timestamp };
}

export function hostFor(source: string): string {
	try {
		return new URL(source).hostname;
	} catch {
		return source;
	}
}
