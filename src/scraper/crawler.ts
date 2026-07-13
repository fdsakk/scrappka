import {
	discoverSiteUrlsStream,
	scrapeUrl,
	type DiscoverEvent,
	type DiscoverOptions,
} from "./scraper.ts";
import {
	appendPages,
	contentHashFor,
	createJob,
	finalizeMapping,
	getScrapeJobSummary,
	pageContentUnchanged,
	reopenMapping,
	updateJobMetadata,
	updateMappingActivity,
	updatePageStatuses,
	writePageFile,
	type JobIdParts,
	type MappingActivity,
	type PageMetadata,
	type PageStatus,
} from "../repositories/storage.ts";

const SCRAPE_CONCURRENCY = Math.max(1, Number(process.env.SCRAPE_CONCURRENCY ?? 8));

export type StartMappingOptions = Omit<DiscoverOptions, "signal">;

/** Discovery is aborted after this long with no fetch activity — a rate-limited
 * server can stall the crawl indefinitely otherwise. Reset on every fetch/URL
 * event; only a true stall trips it. */
const MAPPING_STALL_TIMEOUT_MS = Number(process.env.SCRAPER_STALL_TIMEOUT_MS ?? 120_000);

/**
 * In-process registry of abort controllers for mappings currently running.
 * Keyed by jobId. Populated in `runMappingInBackground`, cleared when it
 * settles. `cancelMapping` reaches in to abort a live crawl.
 */
const activeMappings = new Map<string, AbortController>();
const activeScrapes = new Set<string>();

function scrapeKey(jobId: string, slug: string): string {
	return `${jobId}/${slug}`;
}

/**
 * Aborts a running mapping crawl and finalizes the job as `cancelled`, keeping
 * whatever pages were already discovered so the user can scrape them. Returns
 * false when the job is missing or already terminal.
 */
export async function cancelMapping(jobId: string): Promise<boolean> {
	const summary = await getScrapeJobSummary(jobId);
	if (!summary || summary.mapping.status !== "mapping") return false;

	const controller = activeMappings.get(jobId);
	controller?.abort();
	await finalizeMapping(jobId, { status: "cancelled" });
	return true;
}

/**
 * Creates a job and spawns a background task that streams URLs from
 * `discoverSiteUrlsStream` into the job. Returns the new job id immediately —
 * callers do not await mapping completion.
 *
 * Errors are written to `metadata.mapping` so the UI can recover; uncaught
 * exceptions are logged but never propagate out of the background task.
 */
export async function startMapping(rootUrl: string, opts: StartMappingOptions = {}): Promise<JobIdParts> {
	const job = await createJob(rootUrl);
	void runMappingInBackground(job.id, rootUrl, opts);
	return job;
}

/**
 * Re-runs discovery on an existing job ("Map again"). Flips the job back to
 * `mapping` and re-crawls from its source; `appendPages` de-dupes by URL, so
 * already-known pages (including scraped/failed ones) are untouched and only
 * genuinely new URLs are added. Returns false if the job is missing or a
 * mapping is already running.
 */
export async function remapSite(jobId: string): Promise<boolean> {
	const source = await reopenMapping(jobId);
	if (!source) return false;
	void runMappingInBackground(jobId, source, {});
	return true;
}

const ACTIVITY_WRITE_INTERVAL_MS = 1000;

async function runMappingInBackground(jobId: string, rootUrl: string, opts: StartMappingOptions): Promise<void> {
	const controller = new AbortController();
	activeMappings.set(jobId, controller);

	// Reset on every fetch/URL event; if it fires, the crawl has stalled
	// (typically a server rate-limiting us into silence) and we abort.
	let stallTimer: ReturnType<typeof setTimeout> | undefined;
	const resetStallTimer = (): void => {
		clearTimeout(stallTimer);
		stallTimer = setTimeout(() => controller.abort(), MAPPING_STALL_TIMEOUT_MS);
	};
	resetStallTimer();

	const activity: MappingActivity = { phase: "sitemap", fetchErrors: 0, updatedAt: new Date().toISOString() };
	let lastActivityWrite = 0;

	const persistActivity = (force: boolean): void => {
		const now = Date.now();
		if (!force && now - lastActivityWrite < ACTIVITY_WRITE_INTERVAL_MS) return;
		lastActivityWrite = now;
		activity.updatedAt = new Date().toISOString();
		void updateMappingActivity(jobId, { ...activity }).catch(() => {});
	};

	const onEvent = (event: DiscoverEvent): void => {
		resetStallTimer();
		if (event.type === "phase") {
			activity.phase = event.phase;
			persistActivity(true);
		} else if (event.type === "fetching") {
			activity.lastUrl = event.url;
			persistActivity(false);
		} else if (event.type === "fetch-error") {
			// A crawl fetch that fails just means we couldn't read that page for
			// links — record it as telemetry, don't touch the page set. The page
			// (if discovered elsewhere) stays; the user can scrape or re-map.
			activity.fetchErrors += 1;
			activity.lastError = { url: event.url, message: event.message, at: new Date().toISOString() };
			persistActivity(true);
		}
	};

	try {
		for await (const batch of discoverSiteUrlsStream(rootUrl, { ...opts, onEvent, signal: controller.signal })) {
			await appendPages(jobId, batch);
		}
		// Aborting the signal stops the generator cleanly (it returns rather than
		// throws), so a cancel/stall lands here. Keep the discovered pages and
		// mark the job cancelled instead of mapped.
		await finalizeMapping(jobId, { status: controller.signal.aborted ? "cancelled" : "mapped" });
	} catch (err) {
		if (controller.signal.aborted) {
			await finalizeMapping(jobId, { status: "cancelled" }).catch(() => {});
		} else {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[mapping] ${jobId} failed:`, message);
			try {
				await finalizeMapping(jobId, { status: "failed", error: message });
			} catch (innerErr) {
				console.error(`[mapping] ${jobId} could not be marked failed:`, innerErr);
			}
		}
	} finally {
		clearTimeout(stallTimer);
		activeMappings.delete(jobId);
	}
}

export interface ScrapeBatchResult {
	done: string[];
	skipped: string[];
	failed: { slug: string; error: string }[];
}

export class ScrapeAlreadyActiveError extends Error {}

/** Persists the batch as active before the HTTP request returns, then runs it in the background. */
export async function startScrapeSelectedPages(
	jobId: string,
	slugs: string[],
	pages: Record<string, PageMetadata>,
): Promise<void> {
	const uniqueSlugs = [...new Set(slugs)];
	const busy = uniqueSlugs.filter((slug) => activeScrapes.has(scrapeKey(jobId, slug)));
	if (busy.length > 0) throw new ScrapeAlreadyActiveError(`Pages already scraping: ${busy.join(", ")}`);

	for (const slug of uniqueSlugs) activeScrapes.add(scrapeKey(jobId, slug));
	try {
		await updatePageStatuses(
			jobId,
			Object.fromEntries(uniqueSlugs.map((slug) => [slug, { status: "scraping" as const, error: undefined }])),
		);
	} catch (error) {
		for (const slug of uniqueSlugs) activeScrapes.delete(scrapeKey(jobId, slug));
		throw error;
	}

	void runScrapeBatch(jobId, uniqueSlugs, pages).catch((error) => {
		console.error(`[scrape] ${jobId} batch failed:`, error);
	});
}

async function runScrapeBatch(
	jobId: string,
	slugs: string[],
	pages: Record<string, PageMetadata>,
): Promise<ScrapeBatchResult> {
	const result: ScrapeBatchResult = { done: [], skipped: [], failed: [] };
	try {
		for (let offset = 0; offset < slugs.length; offset += SCRAPE_CONCURRENCY) {
			const chunk = slugs.slice(offset, offset + SCRAPE_CONCURRENCY);
			const outcomes = await Promise.all(chunk.map((slug) => scrapeOne(jobId, slug, pages[slug])));
			const patches: Record<string, Partial<PageMetadata>> = {};
			for (const outcome of outcomes) {
				patches[outcome.slug] = outcome.patch;
				if (outcome.kind === "done") result.done.push(outcome.slug);
				else if (outcome.kind === "skipped") result.skipped.push(outcome.slug);
				else result.failed.push({ slug: outcome.slug, error: outcome.error });
			}
			await updatePageStatuses(jobId, patches);
			for (const slug of chunk) activeScrapes.delete(scrapeKey(jobId, slug));
		}
	} finally {
		for (const slug of slugs) activeScrapes.delete(scrapeKey(jobId, slug));
	}
	return result;
}

type ScrapeOutcome =
	| { slug: string; kind: "done"; patch: Partial<PageMetadata> }
	| { slug: string; kind: "skipped"; patch: Partial<PageMetadata> }
	| { slug: string; kind: "failed"; error: string; patch: Partial<PageMetadata> };

async function scrapeOne(jobId: string, slug: string, page: PageMetadata | undefined): Promise<ScrapeOutcome> {
	try {
		if (!page) throw new Error("Page not found in job");

		const { markdown, metadata, structure } = await scrapeUrl(page.url);
		if (pageContentUnchanged(page, markdown)) {
			return { slug, kind: "skipped", patch: { status: "skipped", scrapedAt: new Date().toISOString() } };
		}

		const hash = contentHashFor(markdown);
		const scrapedAt = new Date().toISOString();
		await writePageFile(jobId, slug, "raw.md", markdown);
		await writePageFile(
			jobId,
			slug,
			"meta.json",
			JSON.stringify(
				{
					url: page.url,
					contentHash: hash,
					scrapedAt,
					title: metadata.title,
					description: metadata.description,
					author: metadata.author,
					usedReadability: metadata.usedReadability,
					structure,
				},
				null,
				2,
			),
		);
		return { slug, kind: "done", patch: { status: "done", contentHash: hash, scrapedAt } };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		return { slug, kind: "failed", error, patch: { status: "failed", error } };
	}
}

/**
 * A process restart or interrupted request can leave pages stuck as `scraping`
 * in metadata while no worker exists anymore. Convert those stale rows back to
 * visible failures when project state is read.
 */
export async function recoverStaleScrapes(jobId: string): Promise<number> {
	let recovered = 0;
	await updateJobMetadata(jobId, (metadata) => {
		const pages = { ...metadata.pages };
		for (const [slug, page] of Object.entries(metadata.pages)) {
			if (page.status !== "scraping") continue;
			if (activeScrapes.has(scrapeKey(jobId, slug))) continue;
			recovered += 1;
			pages[slug] = {
				...page,
				status: "failed",
				error: "Scrape przerwany lub proces został zrestartowany. Możesz uruchomić go ponownie.",
			};
		}
		return recovered > 0 ? { ...metadata, pages } : metadata;
	});
	return recovered;
}

export function pageStatusCounts(pages: Record<string, { status: PageStatus }>): Record<PageStatus, number> {
	const counts: Record<PageStatus, number> = {
		pending: 0,
		scraping: 0,
		done: 0,
		failed: 0,
		skipped: 0,
	};
	for (const page of Object.values(pages)) counts[page.status]++;
	return counts;
}
