# Jira Members-Only Sync Design

**Date:** 2026-04-21
**Status:** Approved

## Problem

After an initial Jira migration, new Jira users are added over time (new hires, contractors, etc.). Re-running the full migration to pick them up would re-import all projects and issues on top of existing data. There is no way to sync only members without triggering the full 6-phase pipeline.

## Solution

Add a `membersOnly: boolean` flag to the existing migration flow. When `true`, the worker exits cleanly after Phase 1 (member upsert) and Phase 1b (project member sync) — skipping Phases 2–6 (projects, sprints, issues, comments, attachments). A "Sync Members from Jira" button on the Migrate from Jira page triggers this mode with one click.

The full migration path is completely unchanged — `membersOnly` defaults to `false`/`undefined`.

---

## Architecture

### Layer 1 — DTO (`start-migration.dto.ts`)

Add one optional field to `StartMigrationDto`:

```ts
@ApiPropertyOptional({ description: 'When true, only run member import phases (1 + 1b). Skip projects, sprints, issues, comments, attachments.' })
@IsBoolean()
@IsOptional()
membersOnly?: boolean;
```

`projectKeys` remains required by the DTO but the member-sync button sends `[]` (empty array), which is valid — `@IsNotEmpty({ each: true })` only validates individual elements, not the array length.

### Layer 2 — Migration Service (`migration.service.ts`)

Pass `membersOnly` through to the BullMQ job payload alongside `selectedMemberIds`:

```ts
// In start() method, job data object:
selectedMemberIds: dto.selectedMemberIds ?? null,
membersOnly: dto.membersOnly ?? false,
```

Also add `connectionId` to the `getHistory()` select list so the frontend can read the most recent connection without a new endpoint.

### Layer 3 — Worker (`jira-migration.processor.ts`)

**`MigrationJobData` interface** — add:
```ts
membersOnly?: boolean;
```

**`RunState` interface** — add:
```ts
membersOnly: boolean;
```

**`processJob()`** — propagate flag to state, then after Phase 1b completes, check:
```ts
if (state.membersOnly) {
  await updateRunProgress(progressClient, runId, {
    status: 'completed',
    completedPhase: PHASE_PROJECT_MEMBER_SYNC,
  }, io);
  return; // skip Phases 2–6
}
// otherwise fall through to Phase 2 (unchanged)
```

**Resumability:** If a members-only run failed mid-Phase 1 and is resumed, `completedPhases` will not contain `PHASE_MEMBERS` yet, so Phase 1 re-runs idempotently. If Phase 1 completed but Phase 1b didn't, it picks up at 1b. Once both are in `completedPhases`, the early-exit fires and the run is marked complete. No special resume logic needed.

### Layer 4 — Frontend

**`StartMigrationPayload` in `useMigration.ts`** — add:
```ts
membersOnly?: boolean;
```

**`JiraMigrationPage.tsx`** — query the migration history on mount. If the most recent run has a `connectionId` and status `completed`, show a "Sync Members from Jira" button. Clicking it:

1. Calls `useStartMigration` with:
   ```ts
   {
     runId: crypto.randomUUID(),
     projectKeys: [],
     membersOnly: true,
     selectedMemberIds: undefined, // import all Jira members
   }
   ```
2. Stores the new `runId` in component state
3. Shows inline progress using the existing `useMigrationStatus` polling hook
4. On completion, shows a toast: "Members synced — X members updated"

The button is hidden if:
- No previous completed migration run exists
- A migration is currently in progress (either full or members-only)

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| `membersOnly: true` + `projectKeys: []` | Valid — DTO passes, Phase 2 never reached |
| Existing user re-imported | `ON CONFLICT (email) DO UPDATE` merges `jira_account_id`, preserves password/tokens |
| Admin-deactivated member re-imported | `organization_members` row is re-created (`ON CONFLICT DO NOTHING` — idempotent insert, no duplicate). Their `isActive` is NOT reset — deactivation was intentional |
| Jira user has GDPR-hidden email | Synthetic `jira-xxx@migrated.jira.local` address used, same as full migration |
| No existing projects | Phase 1b's `projects.length === 0` guard skips gracefully |
| Members-only run fails mid-Phase 1 | Resume re-runs Phase 1 idempotently (upsert SQL), then 1b, then exits |
| Members-only run fails mid-Phase 1b | Resume skips Phase 1 (in `completedPhases`), re-runs 1b from scratch (idempotent), then exits |
| Concurrent full migration running | Existing lock mechanism in `processJob` prevents two runs simultaneously |
| No previous migration (no `connectionId`) | "Sync Members" button is hidden — user must run full migration first |
| OAuth token expired | Existing `refreshOAuthToken()` in migration service handles this transparently |
| `selectedMemberIds: undefined` (default) | `null` in job data → Phase 1 imports ALL Jira members (existing behavior) |

---

## Data Flow

```
User clicks "Sync Members from Jira"
  → POST /api/migration/jira/start { runId, projectKeys: [], membersOnly: true }
  → MigrationService.start() enqueues BullMQ job with membersOnly: true
  → Worker: Phase 1 — upsert users + org_members (ON CONFLICT DO UPDATE/NOTHING)
  → Worker: Phase 1b — sync project_members from existing issues
  → Worker: membersOnly === true → mark run completed, return
  → Frontend polls /status/:runId → shows completion
  → Toast: "Members synced"
```

---

## What Does NOT Change

- Full migration flow (`membersOnly` absent or `false`) — zero changes to phase execution
- Phase 1 upsert SQL — unchanged
- Phase 1b project member sync SQL — unchanged
- All 6 phases for full migration — unchanged
- Existing `selectedMemberIds` filtering — unchanged
- Progress tracking, error logging, resumability — all inherited automatically
