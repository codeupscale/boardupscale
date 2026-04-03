# Jira Cloud → Boardupscale: migration plan (schema, API mapping, production)

This document ties the **Boardupscale PostgreSQL schema and import pipeline** to **Jira Cloud REST API v3** capabilities, so you can run a controlled production migration (and know what is **not** representable today).

**Authoritative references**

- Jira Cloud REST API v3: [Platform REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- Issue search (JQL): [`POST /rest/api/3/search/jql`](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post) (pagination via `nextPageToken`; legacy `POST /search` is obsolete on Cloud)
- JQL helpers (parse, autocomplete): [JQL API group](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-jql/#api-group-jql) — useful for validation, **not** for bulk data extraction

---

## 1. Boardupscale domain model (what we can store)

The initial migration (`services/api/src/database/migrations/1741651200000-InitialSchema.ts`) and TypeORM entities define the tenant. **Tenant boundary** is `organization_id` on org-scoped rows.

### 1.1 Core entities (migration-relevant)

| Table / entity | Purpose | Notes |
|----------------|---------|--------|
| `organizations` | Tenant | Target org UUID for all migration |
| `users` | Org members | Unique `email` globally; roles `owner` / `admin` / `member` / `viewer`; optional `oauth_provider` + `oauth_id` |
| `projects` | Work container | Unique `(organization_id, key)`; `owner_id`, `next_issue_number` |
| `project_members` | Project access | `(project_id, user_id)` unique; `role` string + optional `role_id` → `roles` |
| `issue_statuses` | Kanban columns | Per project; `category` todo / in_progress / done |
| `sprints` | Timeboxes | Per project; dates, status |
| `issues` | Work items | `number` + `key` per project; parent/child; `labels[]`; story points, estimates |
| `comments` | Threaded discussion | `issue_id`, `author_id`, `content` |
| `issue_links` | Directed links | `link_type`, source/target issue |
| `issue_watchers` | Watchers | user ↔ issue |
| `attachments` | Files | Storage metadata; usually MinIO/S3 in app |
| `work_logs` | Time entries | Per issue / user |
| `components` / `issue_components` | Component taxonomy | Per project |
| `versions` / `issue_versions` | Fix versions / releases | Per project |
| `custom_field_definitions` / `custom_field_values` | Custom fields | Org/project scoped definitions |

**Out of scope for Jira parity (different product):** `billing_*`, `github_*`, `ai_*`, `chat_*`, `pages` (unless you map Confluence separately), `automation_rules` (would be a separate rules import).

### 1.2 What the current Jira import worker actually writes

**Source:** `services/worker/src/import/import.worker.ts` processing `JiraExport` JSON.

- **Creates** (or reuses) **one** `projects` row per import job when `targetProjectId` is not set (from first Jira project or inferred key).
- **Ensures** `project_members` for the importing user.
- **Creates** `issue_statuses` from distinct Jira statuses on imported issues.
- **Inserts** `issues` (assignee/reporter resolved by **email** → org user id; falls back to importer).
- **Inserts** `comments` from `fields.comment.comments`.
- **Sets** `issues.parent_id` from `fields.parent` after all issues inserted (subtasks).
- **Does not** persist today: `issuelinks` → `issue_links`, attachments, worklogs, components/versions, sprints, watchers, arbitrary custom fields (only hardcoded story points field `customfield_10016` in types), **original Jira issue key** as a durable column (keys are regenerated as `{BoardupscaleProjectKey}-{seq}`).

**Python fetcher:** `scripts/jira_cloud_import.py` already requests JQL search with fields including `issuelinks` — but the **worker does not consume** them yet.

---

## 2. Jira Cloud: what you can fetch (API → our tables)

### 2.1 Identity & membership

| Jira | Boardupscale | Status / gap |
|------|----------------|--------------|
| Jira users (group members, assignees) | `users` | Emails often **hidden** by Jira privacy; use **invites**, **synthetic emails**, or **admin** APIs. Script: `scripts/jira_sync_org_members_to_db.py` |
| Project role actors | `project_members` | Partially covered by `scripts/jira_full_org_import.py` (API + project membership) |
| Atlassian Teams (org API) | No first-class “team” table | **Gap** — use groups or a future `teams` module |

### 2.2 Projects & configuration

| Jira | Boardupscale | Notes |
|------|----------------|-------|
| `GET /rest/api/3/project/{key}` | `projects` | Name, key, description, project type |
| Components | `components` + `issue_components` | **Gap** in worker — add import pass |
| Versions | `versions` + `issue_versions` | **Gap** |
| Boards | No dedicated `boards` table in initial schema | **Gap** — Boardupscale boards may be derived from UI; confirm product model |

### 2.3 Issues & work

| Jira | Boardupscale | Status |
|------|----------------|--------|
| `POST /rest/api/3/search/jql` | `issues` | **Implemented** via export JSON + worker |
| Issue types | `issues.type` | Mapped in worker (`ISSUE_TYPE_MAP`) |
| Priority | `issues.priority` | Mapped |
| Status | `issue_statuses` + `issues.status_id` | Created per project |
| Description (ADF) | `issues.description` | Stored as string; normalize ADF → text/HTML if needed |
| Labels | `issues.labels` | Yes |
| Story points | `issues.story_points` | Only `customfield_10016` in code — **site-specific** field id |
| Time tracking | `issues.time_estimate` / `time_spent` | Yes |
| Parent / subtask | `issues.parent_id` | Yes |
| Issue links | `issue_links` | **Fetched in Python, not imported in worker** |
| Comments | `comments` | Yes |
| Attachments | `attachments` + blob storage | **Gap** — need `GET /rest/api/3/attachment/content/{id}` + upload to Boardupscale |
| Worklogs | `work_logs` | **Gap** |
| Watchers | `issue_watchers` | **Gap** |

### 2.4 JQL API group (your link)

The [JQL REST API group](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-jql/#api-group-jql) supports **parse**, **autocomplete**, **sanitize**, **GDPR-related JQL conversions** — **not** bulk issue listing. **Bulk listing** is **`/search/jql`** (issue search), not JQL metadata endpoints.

---

## 3. Production migration strategy (phased)

### Phase 0 — Preconditions

- [ ] **Target org** exists; owner/admin accounts ready.
- [ ] **DATABASE_URL**, **Redis**, **API**, **worker** (`import` queue) healthy in production.
- [ ] **Jira API token** with at least `read:jira-work` (classic) / granular equivalents; **browse** on all projects to migrate.
- [ ] **Rate limits**: implement backoff (already in `jira_cloud_import.py`).

### Phase 1 — Users & project access

1. Run `scripts/jira_sync_org_members_to_db.py` (with agreed policy: real emails vs synthetic `jira-{accountId}@imported.local`).
2. Optionally align **project roles** (`jira_full_org_import.py` or custom script) → `project_members`.

### Phase 2 — Export per Jira project

1. For each Jira project key, run `scripts/jira_cloud_import.py` (or orchestrator) to build **JiraExport JSON** (issues via `search/jql`).
2. Extend field list to **everything you need next** (see Phase 3): `customfield_*` discovery via a one-off **field metadata** fetch (`GET /rest/api/3/field`).

### Phase 3 — Upload & async import

1. `POST /api/import/jira/upload` (multipart JSON).
2. `POST /api/import/jira/start` with `organizationId` context (JWT), optional `targetProjectId`, `userMapping`.
3. Poll `GET /api/import/jira/status/:jobId` (Redis-backed).

### Phase 4 — Worker hardening (recommended before “complete” parity)

1. **Preserve Jira key**: add `issues.external_ref` or `metadata` JSONB + migration (or store in `projects.settings` map `jiraKey → uuid`).
2. **Issue links**: map `issuelinks` → `issue_links` after issues inserted.
3. **Attachments**: download + Boardupscale file upload API (if available) or DB `attachments` + blob.
4. **Worklogs**: `work_logs` rows.
5. **Components & fix versions**: populate `components`, `versions`, join tables.
6. **Sprints**: Jira Agile API (`/rest/agile/1.0/board`, `sprint`) — map to `sprints` + `issues.sprint_id`.
7. **Story points**: configurable field id (not hardcoded `10016`).

### Phase 5 — Verification

- Row counts per project vs Jira (issues, comments).
- Spot-check critical issues (links, parents, statuses).
- **Re-run idempotency**: today imports are **not** idempotent; use **new** project keys or add dedupe by `external_ref` before second run.

---

## 4. “One script” for production

**Reality:** a single file cannot responsibly do **everything** without sharing code with the **Nest worker** (TypeScript) or duplicating DB logic. The maintainable approach:

| Layer | Responsibility |
|-------|----------------|
| **Python** | Jira REST fetch, rate limits, JSON export, optional direct DB for **users** |
| **API + worker** | Transactional issue insert, org scoping, Redis job status |

**Deliverable in repo:** `scripts/jira_migration_orchestrator.py` — validates env, runs member sync, loops projects, calls existing `jira_cloud_import.py`, uploads and starts jobs, optional wait for completion.

**Long-term:** add **`jira-import-v2`** job type with extended mapper or move **import logic** to Nest service for testability.

---

## 5. Schema migrations you may need

| Change | Purpose |
|--------|---------|
| `issues.jira_key` or `issues.external_id` + `import_source` | Idempotent re-import, audit |
| `issues.description_format` | `text` vs `adf` |
| `projects` metadata | `jira_project_id` |

Follow existing gate: `database` → `migration` → `backend` → `qa`.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Email visibility | Synthetic emails + user mapping CSV |
| Custom field explosion | `GET /rest/api/3/field` + map to `custom_field_definitions` |
| API rate limits | Backoff, smaller batches, off-peak window |
| **Non-idempotent** imports | External ref column + unique constraint strategy |
| Attachment size | Stream + size caps; align with `import.controller` limit (100MB upload for JSON) |

---

## 7. Checklist summary

- [ ] Users in org (sync script + policy)
- [ ] Per-project Jira JSON export (`search/jql`)
- [ ] Upload + worker import
- [ ] Extend worker for links, attachments, worklogs, components, versions, sprints (as needed)
- [ ] DB migration for external keys if reimport required
- [ ] QA: tenant isolation tests for org-scoped data

This plan should be updated when the product adds **boards** schema or **team** entities.
