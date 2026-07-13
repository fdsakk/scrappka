export type PageStatus = "pending" | "scraping" | "done" | "failed" | "skipped";
export type PageKind = "content" | "listing" | "image" | "document" | "asset";
export type MappingStatus = "mapping" | "mapped" | "failed" | "cancelled";

export interface PageMetadata {
	url: string;
	status: PageStatus;
	kind?: PageKind;
	contentHash?: string;
	scrapedAt?: string;
	error?: string;
}

export interface MappingActivity {
	phase: "sitemap" | "crawl";
	lastUrl?: string;
	fetchErrors: number;
	lastError?: { url: string; message: string; at: string };
	updatedAt: string;
}

export interface MappingMetadata {
	status: MappingStatus;
	startedAt: string;
	finishedAt?: string;
	discovered: number;
	error?: string;
	activity?: MappingActivity;
}

export interface JobSummary {
	id: string;
	source: string;
	sourceKey: string;
	createdAt: string;
	updatedAt: string;
	files: string[];
	pages: Record<string, PageMetadata>;
	mapping: MappingMetadata;
}

export interface ProjectListItem {
	id: string;
	source: string;
	createdAt: string;
	updatedAt: string;
	mapping: MappingMetadata;
	counts: Record<PageStatus, number>;
	files: string[];
}

export interface ProjectsResponse {
	projects: ProjectListItem[];
}

export interface StartMapResponse {
	id: string;
	host: string;
	timestamp: string;
}

export interface ScrapeStatusResponse {
	mapping: MappingMetadata;
	pages: Record<string, PageMetadata>;
	counts: Record<PageStatus, number>;
}
