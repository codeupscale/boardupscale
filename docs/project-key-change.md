# Project Key Change

Production implementation for renaming a project's key after creation (Jira-style), with atomic issue re-keying and backward-compatible URL resolution.

## Problem

Changing the project key in Settings appeared to succeed but reverted on refresh. Root cause: `key` was stripped by NestJS `ValidationPipe` whitelist (or later explicitly rejected). The database never updated.

## Design principles

| Principle | How |
|-----------|-----|
| **Single source of truth** | `projects.key` in PostgreSQL is canonical. API responses and UI read from there. |
| **Stable identity** | Project UUID and issue UUIDs never change. Only the human-readable prefix changes. |
| **Atomicity** | Key rename + all issue key strings + alias insert run in one DB transaction. |
| **Multi-tenant safety** | All checks scoped by `organization_id`. Keys unique per org; old keys reserved via aliases. |
| **Jira parity** | Old keys resolve to the same project; issue numbers are preserved (`OLD-5` → `NEW-5`). |

## What happens on key change

1. User edits key in **Project → Settings → General** and saves.
2. If key changed, a **confirmation dialog** requires typing the new key.
3. Backend transaction:
   - Locks the project row (`FOR UPDATE`).
   - Inserts `project_key_aliases` row for the old key.
   - Updates `projects.key`.
   - Bulk-updates `issues.key` = `newKey || '-' || number` for all issues in the project.
4. Audit log: `project.key_changed` with `previousKey` / `newKey`.
5. Frontend:
   - Redirects URL to `/projects/{newKey}/...`.
   - Updates React Query caches; invalidates board/issues/sprints.
   - Updates sidebar recent-projects in `localStorage`.

## Database

### `project_key_aliases` (migration `1747800000000`)

| Column | Purpose |
|--------|---------|
| `organization_id` | Tenant scope |
| `project_id` | Target project (FK, cascade delete) |
| `old_key` | Previous key; unique per org |

Old keys cannot be assigned to a new project (checked on create and rename).

### Unchanged

- `issues.number` — not renumbered (unlike bulk move to another project).
- `jira_project_key` — separate Jira import identifier; not modified.
- Issue URLs `/issues/{uuid}` — unchanged.

## Backend files

| File | Role |
|------|------|
| `migrations/1747800000000-AddProjectKeyAliases.ts` | Alias table |
| `entities/project-key-alias.entity.ts` | TypeORM entity |
| `dto/update-project.dto.ts` | `key` validation (2–10 chars, uppercase alphanumeric) |
| `projects.service.ts` | `assertProjectKeyAvailable`, `resolveProjectId`, atomic `update` |
| `resolve-project.pipe.ts` | Resolves current key **or** alias → project UUID |
| `projects.service.spec.ts` | Unit tests |
| `resolve-project.pipe.spec.ts` | Pipe tests |

### API resolution flow

```
Request with project key "OLDKEY"
  → ResolveProjectPipe
  → SELECT from projects WHERE key = 'OLDKEY'
  → UNION alias lookup
  → Returns project UUID for all downstream services
```

UUID in URL still works without alias lookup.

## Frontend files

| File | Role |
|------|------|
| `project-key-change-dialog.tsx` | Confirmation UX (type new key to confirm) |
| `project-layout.tsx` | Canonical URL redirect when loaded key ≠ URL segment |
| `App.tsx` | Nested `/projects/:key/*` routes under `ProjectLayout` |
| `ProjectSettingsPage.tsx` | Key change flow + navigate after success |
| `useProjects.ts` | Cache invalidation on key change |
| `lib/recent-projects.ts` | Shared localStorage helpers + `renameRecentProjectKey` |
| `project-form.tsx` | Key field editable on existing projects |

## Edge cases

| Case | Behavior |
|------|----------|
| Key unchanged | Normal PATCH (name/description only); no transaction |
| Duplicate key in org | `409 Conflict` |
| Key reserved as old alias | `409 Conflict` |
| Old URL bookmark | API works via alias; `ProjectLayout` updates the address bar to the new key (same project, not a copy) |
| Comments mentioning old key | Not rewritten (documented in dialog) |
| Search | PostgreSQL search uses `issues.key` — updated automatically |
| Exports | Next export uses new `project.key` in filename |
| Type / template | Still immutable after creation |

## Tests

```bash
cd services/api
npm test -- --testPathPattern="projects.service.spec|resolve-project.pipe.spec"
```

## Manual verification

1. Create project `TESTKEY`, add issues `TESTKEY-1`, `TESTKEY-2`.
2. Settings → change key to `NEWKEY` → confirm dialog → save.
3. Verify issues show `NEWKEY-1`, `NEWKEY-2` on board.
4. Visit `/projects/TESTKEY/board` → should redirect to `/projects/NEWKEY/board`.
5. Refresh settings — key stays `NEWKEY`.
6. Try creating a project with key `TESTKEY` → should fail (reserved).
