# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Runtime:** Bun. Server is `bun src/index.ts`. No build step on the server side.
- **Server:** Hono on Bun (`src/index.ts`), serves the API under `/api/*` and the built SPA from `client/dist` under `/app/*`.
- **Client:** Vite + TanStack Router (file-based routes in `client/src/routes`), React 19, Tailwind 4, Biome, Vitest. Vite `base: "/app"`.
- **Scraper:** in-process custom backend (`src/scraper/scraper.ts`) — fetch + JSDOM + Readability + Turndown. No external scraping service. URL discovery is an `AsyncGenerator` that yields canonical URL batches (sitemap.xml → BFS crawl), so mapping streams progress instead of blocking.
- **OpenSpec generation:** not done by this app. It exports a knowledge base + `PROMPT.md` ZIP; a local LLM agent (Claude Code, Cursor, aider, ...) runs the actual OpenSpec authoring against that ZIP. No external services.

## Commands

Server (repo root):
- `bun run dev` — start API + static server on `PORT` (default 3000).
- `bun run app` — `client` build then start server.
- `bun run check` — typecheck + server/client-adjacent Bun tests.

Client (`cd client`):
- `bun run dev` — Vite dev on port 3000 (separate from Bun server).
- `bun run build` — produces `client/dist` consumed by the Bun server.
- `bun run test` — Vitest.
- `bun run check` / `lint` / `format` — Biome.

Infra:
- `docker compose -f deploy/docker-compose.yml up -d --build` — app on 3000.

## Environment

The scraper modules read `SCRAPER_UA`, `SCRAPER_TIMEOUT_MS`, `SCRAPER_MAX_BYTES`, `SCRAPER_CRAWL_CONCURRENCY`, `SCRAPER_DISCOVER_BATCH`, `SCRAPER_DISCOVER_LIMIT` and `SCRAPER_STALL_TIMEOUT_MS`. `src/scraper/crawler.ts` reads `SCRAPE_CONCURRENCY`. Brand probing reuses the shared bounded fetcher. Storage root via `SCRAPED_DIR` (default `./scraped_data`). Optional basic auth via `AUTH_USERNAME`/`AUTH_PASSWORD`. `.env` is gitignored; check `.env.example`.

## Architecture

The unit of work is a **scrape job**, identified by `<host>/<timestamp>` and stored as a directory under `scraped_data/`. There is no database — `metadata.json` per job is the source of truth, and all server endpoints derive their responses by reading the filesystem.

Pipeline:

1. **Map** (`POST /api/app/site/map`): `src/scraper/crawler.ts::startMapping` creates the job dir atomically (writes `metadata.json` with `mapping.status="mapping"`) and returns `{id, host, timestamp}` immediately. A background task consumes `discoverSiteUrlsStream` (sitemap.xml → BFS crawl) batch by batch, calling `src/repositories/storage.ts::appendPages` to assign slugs and grow `metadata.pages`. When the generator drains, `finalizeMapping` flips status to `mapped` (or `failed` with an error).
2. **Scrape** (`POST .../scrape`): `scrapeSelectedPages` fans out (concurrency = `SCRAPE_CONCURRENCY`, default 8), each worker scrapes via `scrapeUrl`, writes `pages/<slug>/raw.md` + `meta.json` (title/description/author from Readability plus a `structure` block — headings, forms with fields/labels, nav links, footer text — extracted by `src/scraper/html-to-md.ts` from the full DOM before noise stripping), and patches per-page status via `updatePageStatus`. Skipped if `contentHash` matches existing. Discovery respects robots.txt disallow rules and strips tracking params during URL canonicalization.
3. **Stream** (SSE `GET .../stream`): single channel covering both mapping and scraping. Pushes a `status` payload (`mapping`, `pages`, `counts`) on every metadata change, then `done` once mapping is terminal and no page is actively scraping. Unselected pending pages do not keep the stream open.
4. **Knowledge export ZIP** (`GET .../knowledge/zip`): the sole downstream step. `src/services/site.service.ts::prepareKnowledgeExport` runs `src/knowledge/build.ts::buildKnowledge` — distills scraped pages into a file-based knowledge base under the job dir: `knowledge/site.md` (inventory + nav + `buildSiteTree` URL tree), one `knowledge/templates/<id>.md` + `knowledge/data/<id>.jsonl` per repeated page cluster, and `knowledge/content/<slug>.md` for unique pages. Probes the brand (`brand-probe.ts`, best-effort) into `knowledge/brand.json`, renders `PROMPT.md` (`src/knowledge/prompt.ts`), then streams `zip -r - PROMPT.md knowledge/`. The OpenSpec authoring itself happens later, in a local LLM agent run against the unpacked ZIP — this app does not call any LLM.

Per-page raw scrape outputs are served under `pages/<slug>/` via `/api/page-preview` and `/api/page-download` (used by the UI to inspect a page's `raw.md`).

### `src/repositories/storage/` invariants

`src/repositories/storage.ts` is a barrel; implementation lives in `storage/paths.ts` (path resolution, slugs, file IO), `storage/metadata.ts` (types, normalization, serialized metadata mutations, listeners) and `storage/jobs.ts` (create/list/delete/summary).

- `resolveJobPath` and `resolvePagePath` defend against traversal — every callable path is checked to start with `SCRAPED_ROOT`. Don't bypass them with manual `join`.
- Slugs must match `/^[a-z0-9][a-z0-9-]*$/`; `pageSlugForUrl` enforces uniqueness against an existing set.
- `readJobMetadata` rejects metadata without a valid `mapping` block. When extending `JobMetadata`, also extend the `normalize*` helpers — fields fall back to defaults or the job is treated as missing. Legacy jobs without `updatedAt` fall back to `createdAt`.
- `updateJobMetadata` serializes RMW per job via a promise chain in `metadataLocks`. All mutations (mapping append, page status) must go through it; never write `metadata.json` directly outside of `createJob`.
- `appendPages` is a no-op once `mapping.status !== "mapping"`, so late callbacks after `finalizeMapping` can't poison the page set.

### Client

`client/src/routes/$host.$timestamp.tsx` is the per-job view; `projects.*` lists jobs. Feature logic lives under `client/src/features/project/`. The client talks to the same-origin Bun server in production (served from `/app`); during `vite dev` on 3000 the API origin differs — check feature code for how this is handled before assuming proxy behavior.

## Conventions

- Server code is pure ESM TypeScript run directly by Bun — no transpile step. Keep `.ts` extensions in imports (`tsconfig` has `allowImportingTsExtensions`).
- Don't introduce a database. The filesystem layout (`scraped_data/<host>/<ts>/{metadata,sitemap}.json` + `pages/<slug>/{raw.md,meta.json}` + generated artifacts at job root) is load-bearing for every endpoint.
- Tests use `bun:test` for server, Vitest for client — don't mix.
