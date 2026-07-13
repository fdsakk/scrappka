# Docker Compose Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the application to start reliably with `docker compose up --build` from the repository root.

**Architecture:** Add a root Compose manifest that builds the existing multi-stage image, persists scraper data in a named volume, and loads deployment settings from `.env`. Keep the health endpoint accessible without Basic Auth so Docker can assess container health when UI/API access is protected.

**Tech Stack:** Docker, Docker Compose, Bun, Hono, TypeScript.

---

### Task 1: Make health checks work with Basic Auth

**Files:**
- Modify: `src/api/app.ts`
- Modify: `src/api/app.test.ts`

- [ ] Add middleware that skips Basic Auth for `/api/health` and delegates authentication for every other route.
- [ ] Add a test that creates an authenticated app, asserts `/api/health` returns 200 without credentials, and asserts `/api/app` returns 401 without credentials.
- [ ] Run `bun test src/api/app.test.ts` and confirm all tests pass.

### Task 2: Add a root Compose entry point

**Files:**
- Create: `compose.yml`

- [ ] Define the `app` service using `Dockerfile` in the repository root, port mapping `${PORT:-3000}:3000`, all scraper environment settings, a named `scraped_data` volume, and `restart: unless-stopped`.
- [ ] Run `docker compose config` and confirm the file resolves successfully.

### Task 3: Document one-command startup

**Files:**
- Modify: `README.md`

- [ ] Replace commands that require `-f deploy/docker-compose.yml` with root-level `docker compose` commands.
- [ ] State that `docker compose up -d --build` starts the service and that setting `AUTH_PASSWORD` enables login protection while leaving Docker health checks operational.
- [ ] Run `bun run check` and review `git diff --check` for errors.
