// Barrel kept so existing `../repositories/storage.ts` imports stay valid.
// Implementation lives in ./storage/{paths,metadata,jobs}.ts.
export {
  pageSlugForUrl,
  readJobFile,
  readPageFile,
  resolveJobPath,
  resolvePagePath,
  sourceKeyFor,
  writeJobFile,
  writePageFile,
} from "./storage/paths.ts";
export {
  appendPages,
  contentHashFor,
  finalizeMapping,
  pageContentUnchanged,
  reopenMapping,
  subscribeJobMetadata,
  updateJobMetadata,
  updateMappingActivity,
  updatePageStatus,
  updatePageStatuses,
  type JobMetadata,
  type MappingActivity,
  type MappingMetadata,
  type MappingStatus,
  type PageMetadata,
  type PageStatus,
} from "./storage/metadata.ts";
export {
  createJob,
  deleteScrapeJob,
  getScrapeJobSummary,
  listScrapeJobs,
  type JobIdParts,
  type JobSummary,
  type ProjectListItem,
} from "./storage/jobs.ts";
