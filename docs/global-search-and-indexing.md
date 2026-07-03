# Global Search & Elasticsearch Indexing

Summary of work delivered for enterprise-grade global search, incremental indexing, and durable per-project reindex jobs.

---

## Overview

Boardupscale now supports **org-wide and project-scoped search** across issues, projects, and members with strict RBAC. Search reads from **Elasticsearch** when available, with automatic **PostgreSQL fallback** (trigram indexes) on ES errors or when ES is not configured.

**Reindex** (backfill / rebuild) is a separate background path: it does **not** run on every `GET /search` request and does not slow down live search.

| Concern | Approach |
|---------|----------|
| Live search | `GET /search` — read-only, parallel PG/ES queries |
| Incremental index | Lightweight BullMQ jobs (`index-issue`, `index-project`, `refresh-member`, etc.) |
| Full project backfill | Durable DB job + phased worker (`reindex-project`) |

---

## Architecture

```
UI (search modal, command palette)
  → GET /search                    [search:read]
  → POST /search/reindex/:projectId [organization:manage-integrations]

API (SearchService, SearchReindexService)
  → PostgreSQL (RBAC + fallback search)
  → Elasticsearch (faceted full-text when configured)
  → BullMQ queue: search-index

Worker (search.worker.ts)
  → Elasticsearch upsert/delete
  → search_reindex_jobs progress updates (reindex only)
```

### Search read path (unchanged by reindex)

- No queue or `search_reindex_jobs` access on `GET /search`
- Org owners/admins: org-wide results
- Other roles: only projects they are members of
- Issue key aliases supported (former project keys)

### Index write paths

1. **Incremental** — fire-and-forget BullMQ jobs on create/update (issues, projects, members)
2. **Reindex** — durable `search_reindex_jobs` row + phased worker with cancel/retry/stall detection

---

## Backend (API)

### Modules & services

| File | Role |
|------|------|
| `search.service.ts` | Global search, RBAC, ES + PG parallel queries, similar-issues |
| `search.controller.ts` | `GET /search`, `GET /search/similar` |
| `search-reindex.service.ts` | Start/status/retry/cancel, stall detection, BullMQ state |
| `search-reindex.controller.ts` | `POST/GET /search/reindex/*` |
| `search-index-queue.service.ts` | Incremental index enqueue (no DB job record) |
| `search.types.ts` | Shared search result types |
| `search-issue-key.utils.ts` | Issue key parsing for search |
| `org-roles.ts` | Org role constants for RBAC |

### Reindex API endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/search/reindex/:projectId` | `202 Accepted`, returns `jobId` |
| `GET` | `/search/reindex/status/:jobId` | `Cache-Control: no-store` |
| `GET` | `/search/reindex/project/:projectId/latest` | Latest job for project |
| `POST` | `/search/reindex/retry/:jobId` | Failed, cancelled, or **stalled** |
| `POST` | `/search/reindex/cancel/:jobId` | Pending or processing |

### Reindex job phases (worker)

1. **Phase 1** — Project document in `boardupscale-projects`
2. **Phase 2** — Issues in batches of 200 (`boardupscale-issues`), resumable via `current_offset`
3. **Phase 3** — Project members (`boardupscale-members`)

### Stall detection (API, on read)

- **Pending** > 2 min without queue job starting → `stalled`
- **Processing** > 30 min without DB progress → `stalled`
- **Queue `completed` but DB still `pending`/`processing`** → `stalled` (worker/ES mismatch)

### Permissions

- `search:read` — search endpoints
- `organization:manage-integrations` — reindex endpoints (owner/admin UI)

---

## Database migrations

Run in order on deploy:

| Migration | Purpose |
|-----------|---------|
| `1748000000000-AddSearchTrigramIndexes` | PG `pg_trgm` indexes for fallback search |
| `1748100000000-AddSearchReadPermission` | `search:read` permission for roles |
| `1748200000000-AddSearchReindexJobs` | `search_reindex_jobs` table |

**Prod command:** `npm run migration:run:prod` (or via deploy pipeline before API restart).

`SearchReindexJob` entity must be registered in `app.module.ts` TypeORM `entities` list.

---

## Worker

### Queue

- Name: `search-index`
- Job types: `index-issue`, `delete-issue`, `index-project`, `delete-project`, `refresh-member`, `delete-member`, `reindex-project`

### Elasticsearch indexes

- `boardupscale-issues`
- `boardupscale-projects`
- `boardupscale-members`

Created on worker startup via `ensureIndex` when ES is reachable.

### Reindex operability

- `lockDuration: 300000` (5 min) for long batches
- Cancel checks between phases/batches
- Resume from `completed_phases` / `current_offset`
- On ES unavailable: mark durable reindex job **failed** in DB (not silent skip)
- SQL fix: join `issue_statuses` (not legacy `statuses` table)

### Environment

Worker reads `ELASTICSEARCH_URL`, `DATABASE_URL`, `REDIS_URL` from env.

- **Docker Compose (prod):** `ELASTICSEARCH_URL=http://elasticsearch:9200`
- **Local host (compose port map):** `ELASTICSEARCH_URL=http://localhost:9202`

`services/worker/src/load-env.ts` loads repo-root `.env` for local dev.

---

## Frontend

| Area | Changes |
|------|---------|
| `useSearch.ts` | Global search hook, filters, highlighting |
| `search-modal.tsx` | Search dialog UI |
| `command-palette.tsx` | Quick search integration |
| `highlighted-text.tsx` | Match highlighting |
| `useSearchReindex.ts` | Start/cancel/retry, poll `/status/:jobId` |
| `search-reindex-panel.tsx` | Project Settings reindex UI |
| `ProjectSettingsPage.tsx` | Panel for users with manage-integrations |
| i18n | `search.*` and `search.reindex.*` in en/de/es/fr/ja |

### UI states

- Pending, processing, completed, failed, cancelled, **stalled**
- Progress bar and issue/member counts during processing
- Retry on failed/cancelled/stalled; Cancel on pending/processing

---

## Hooks & integration

- **Project key change** → `SearchReindexService.startReindex()` after atomic re-key
- **Issue/project/member mutations** → `SearchIndexQueueService` incremental jobs
- Search does **not** include project description (name + key only)

---

## Local development checklist

1. Start Postgres, Redis, Elasticsearch (`docker compose up -d elasticsearch` etc.)
2. Set `.env`:
   ```env
   ELASTICSEARCH_URL=http://localhost:9202
   DATABASE_URL=...
   REDIS_URL=...
   ```
3. Run migrations: `cd services/api && npm run migration:run`
4. Start API, worker, web
5. Worker log should show: `[Elasticsearch] Connected...`
6. Optional: Project Settings → Reindex for existing data backfill

---

## Production deployment checklist

1. Merge/deploy **api**, **web**, **worker** images
2. Run migrations **before** API serves new code
3. Set `ELASTICSEARCH_URL` on **API and worker** (same value)
4. Ensure Elasticsearch service is running
5. Restart worker after ES is up
6. Smoke test: `GET /search`, then one project reindex
7. **Do not** reindex all 100+ projects unless ES is new/empty or you suspect drift

See also: `docs/wiki/Production-Deployment.md`, `.env.production.example`

---

## Issues encountered & fixes (this iteration)

| Symptom | Root cause | Fix |
|---------|------------|-----|
| `No metadata for SearchReindexJob` | Entity missing from `app.module.ts` entities | Added `SearchReindexJob` to allowlist |
| Migration CLI crash on `@/` imports | TypeORM CLI doesn't resolve path aliases | Relative imports in `search-reindex-job.entity.ts` |
| Worker `Missing node(s) option` | `ELASTICSEARCH_URL` unset, no fallback | Restored fallback + `load-env.ts` |
| `ECONNREFUSED 127.0.0.1:9200/9202` | ES not running or wrong port | Start ES; use correct URL for environment |
| `stalled` + `queue: completed` + `dbStatus: pending` | Worker skipped job when ES down | Fail durable job in DB; stall detection |
| Retry 400 on stalled jobs | Retry only allowed `failed`/`cancelled` | Allow `stalled` effective status |
| `relation "statuses" does not exist` | Wrong table in worker SQL | `LEFT JOIN issue_statuses` |
| Endless `/latest` polling | Non-terminal stalled state | Poll `/status/:jobId`; treat stalled as terminal for polling |
| CodeQL unused imports | Leftover imports in spec/UI | Removed `BadRequestException`, `SearchHighlight` |

---

## Testing

- API unit tests: `search.service`, `search.controller`, `search-reindex.service`, DTO/utils
- Builds: `nest build` (api), `tsc` (worker, web)

---

## Day-end report bullets

Use these for status updates (2–3 lines each):

1. **Global search (read path)** — Implemented org-wide and project-scoped search across issues, projects, and members with RBAC (`search:read`). Elasticsearch is primary; PostgreSQL trigram fallback keeps search working when ES is down.

2. **Search API & types** — Added `GET /search` and `GET /search/similar` with validation DTOs, tenant isolation, parallel ES/PG queries, and issue key alias support. Removed project description from searchable fields.

3. **Incremental Elasticsearch indexing** — Wired lightweight BullMQ jobs for issue/project/member create-update-delete via `SearchIndexQueueService` and worker handlers; does not block HTTP search requests.

4. **Durable reindex jobs** — Built `search_reindex_jobs` table, entity, migration, and `SearchReindexService` with start/status/latest/retry/cancel following migration/jira-migration operability patterns.

5. **Phased reindex worker** — Implemented resumable 3-phase reindex (project → issues batched → members) with cancel checks, lock duration, DB progress updates, and failed-state handling when Elasticsearch is unavailable.

6. **Reindex UI** — Added Project Settings search index panel, hooks (`useSearchReindex`), progress/stalled/failed states, cancel/retry actions, and i18n strings across en/de/es/fr/ja.

7. **Production hardening & bug fixes** — Fixed entity registration, migration CLI imports, worker env loading, `issue_statuses` SQL join, stalled retry contract, queue-state resolution for retry jobs, and polling behavior.

8. **Local/prod ES configuration** — Documented `ELASTICSEARCH_URL` differences (host `9202` vs Docker internal `9200`), worker/API env parity, and migration order for deploy.

9. **Verification** — API search/reindex unit tests passing; api/worker/web builds typecheck; end-to-end reindex validated after Elasticsearch container start and worker reconnect.

---

## Related files (quick reference)

```
services/api/src/modules/search/
services/api/src/database/migrations/174800*
services/api/src/database/migrations/174810*
services/api/src/database/migrations/174820*
services/worker/src/search/search.worker.ts
services/worker/src/load-env.ts
services/web/src/hooks/useSearch.ts
services/web/src/hooks/useSearchReindex.ts
services/web/src/components/search/
services/web/src/components/layout/search-modal.tsx
services/web/src/components/layout/command-palette.tsx
```
