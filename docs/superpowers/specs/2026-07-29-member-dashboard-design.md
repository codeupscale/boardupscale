# Member Dashboard (Everyone Except Owner) — Design

## Status

Approved by user 2026-07-29. Ready for implementation planning.

## Background

Boardupscale currently has two dashboards:

1. **Personal dashboard** — `/dashboard`, no role restriction, client-composed from
   granular hooks (`useIssues`, `useProjects`, `useSprints`, `useVelocity`). Shows a
   greeting, 3 stat cards (assigned-issue counts), a single project's mini burndown /
   velocity / "my workload" widgets, an AI Sprint Intelligence panel, "My Issues" table,
   and a recent-projects grid.
2. **Organization Owner dashboard** — `/org/dashboard`, `@Roles('owner')` only,
   backend-composite (`GET /dashboard/organization`), Redis-cached, org-wide project
   scope (`all` projects). Documented in `docs/wiki/Organization-Owner-Dashboard.md`.

`docs/wiki/Organization-Owner-Dashboard.md` references a third dashboard,
"Organization-Admin-Dashboard.md" at `/admin/dashboard` — that doc file does not exist,
and `/admin/dashboard` does not exist anywhere in the frontend (confirmed by repo-wide
grep). However, real scaffolding for it exists as dead code:

- `DashboardScopeResolver` (`services/api/src/modules/dashboard/dashboard-scope.resolver.ts`)
  already types a `DashboardVariant = 'org_owner' | 'org_admin' | 'org_user'` union with a
  `resolveProjectScope()` method, but it is only ever called with the hardcoded literal
  `'org_owner'`, and both call sites discard the return value. It is a complete no-op today.
- The `Administrator` org role, and the `owner`/`member`/`viewer` project roles, are fully
  implemented end-to-end (enum, DB rows, permission bypass) and already gate several
  other pages (Team, Billing, Import, Audit Logs, Jira Migration) via
  `RoleGuard roles={[OWNER, ADMINISTRATOR]}`.

The user supplied a reference image titled "Organization Admin Dashboard" (KPI row,
Open-Issues-by-status donut, Active Sprint Overview, Team Workload, My Projects
Overview table, Recent Organization Activity feed) and clarified through discussion
that:

- This new design is **not** admin-only. It replaces the existing personal dashboard
  content for **everyone except Owner** (Administrator, Member, Viewer) — Owner keeps
  `/org/dashboard` unchanged.
- Data scope is **per-user**: "your own projects + projects you're enrolled in" — not
  the Owner dashboard's full org-wide scope. This matches the image's own KPI
  subtitles ("Created by you", "In your projects").
- The projects table should behave like the Owner dashboard's existing infinite-scroll
  project-health table (not a fixed/paginated list).
- Header should be a generic greeting (not a literal "{Role} Dashboard" title), since
  one page now serves three different roles.
- The activity feed is **"Recent Project Activity"**, scoped to the viewer's own +
  enrolled projects (not the whole org).
- "Total Members" KPI counts distinct members across the viewer's own + enrolled
  projects (not literally "people this user personally invited").
- The existing AI Sprint Intelligence widget (not in the reference image) is kept,
  rendered below the new Active Sprint Overview panel.

## Goals

- Replace `/dashboard`'s content with a backend-composite, per-user-scoped dashboard
  matching the reference image's layout and information density.
- Reuse existing dashboard infrastructure (SQL patterns, Redis caching/locking,
  keyset pagination, chart components) rather than duplicating it — finishing the
  `DashboardScopeResolver`'s dead `'org_user'` branch instead of building parallel
  infrastructure.
- Preserve tenant isolation and existing permission-gating conventions.

## Non-goals

- No changes to `/org/dashboard` or the Owner's data/queries.
- No new routes (`/admin/dashboard` is not being built — see Background).
- No new date-range picker UI; reuses the existing 7d/30d toggle convention instead of
  the image's literal "This Week (Jun 09 – Jun 15)" custom dropdown (explicit scope
  trim — see Open Decisions).
- No schema/migration changes — all data comes from existing tables
  (`projects`, `issues`, `project_members`, `sprints`, `activities`).

## Architecture

No new modules or routes. The existing `dashboard` module
(`services/api/src/modules/dashboard/`) gains a second composite endpoint pair,
structurally parallel to the existing Owner ones, differing only in scope resolution
and the extra widgets the image requires.

The existing `/dashboard` frontend route (already the default landing page for every
role except Owner, per `RootRoute` in `app-routes.tsx`) is unchanged as a route; only
`DashboardPage.tsx`'s content is replaced.

## Backend design

### New endpoints

- **`GET /dashboard/member?range=7d|30d`**
  - `JwtAuthGuard` only — no `@Roles` restriction, matching today's `/dashboard`
    (which has none). Owner can technically call it too, but the frontend never
    routes Owner here.
  - `Cache-Control: no-store`.
  - Redis cache key: `dash:member:{organizationId}:{userId}:v1:{range}` — per-user,
    since scope is per-user (unlike the Owner key, which is per-org). TTL 30s,
    fail-open on Redis unavailability, same distributed lock
    (`SET key 1 EX 5 NX` + 120ms wait-and-recheck) as the existing
    `tryAcquireLock`/`releaseLock` pair.
  - Returns: KPIs, Open-Issues-by-status donut, Active Sprint Overview list, Team
    Workload, Recent Project Activity (series + feed). `meta.variant: 'org_user'`.

- **`GET /dashboard/member/project-health?status=all|active|at_risk|blocked|completed&limit=25&cursor=`**
  - Same `JwtAuthGuard`, same keyset-pagination shape (`{ items, nextCursor, total }`)
    and the same `classifyProjectHealth` rules as the existing
    `GET /dashboard/organization/project-health`, just filtered to the caller's
    scoped project IDs instead of all org projects.
  - Own Redis page cache (~20s), mirroring the existing project-health cache key
    pattern but namespaced `dash:member:...:project-health:...`.

### Scope resolution

`DashboardScopeResolver.resolveProjectScope('org_user')` returns `'membership'`
(already correct in the existing stub — just needs to actually be called and used).
Concretely, the scoped project-ID list for a given `(userId, organizationId)` is:

```sql
SELECT id FROM projects
WHERE organization_id = :organizationId
  AND (owner_id = :userId
       OR id IN (SELECT project_id FROM project_members WHERE user_id = :userId))
```

This ID list is the filter applied to every sub-query below, in addition to the
existing `organization_id` filter (mandatory tenant scoping per CLAUDE.md).

### Data computed

| Widget | Query | Notes |
|---|---|---|
| Total Projects | `COUNT(*)` over scoped IDs | "Created by you" is really "owner_id = you", framed loosely for all scoped projects in the KPI subtitle |
| Active Projects | Scoped IDs, health = `active` via existing `classifyProjectHealth` | Same health rules as Owner dashboard (Blocked → Completed → At Risk → Active precedence) |
| Total Members | `COUNT(DISTINCT user_id)` across scoped projects' `project_members` + `owner_id`s | Per user's clarification: members across own+enrolled projects, not literally "invited by you" |
| Open Issues | Scoped IDs, alive (`deleted_at IS NULL`), not done | |
| Overdue Issues | Scoped IDs, alive, `due_date < now()`, not done | |
| Open Issues by Status (donut) | **New query** — issues grouped by status category (To Do/In Progress/In Review/Blocked/Done) within scoped IDs | Distinct from Owner's donut, which buckets *projects* by health, not *issues* by status. Reuses the visual donut component with new data. |
| Active Sprint Overview | **New query** — sprints with `status = 'active'` within scoped projects, each with total-issue count and %-complete (done/total), sorted by end date | New component, not literally re-used from `MiniBurndownWidget` (see Frontend section) |
| Team Workload | **New query** — per-assignee issue counts (assigned/in-progress/overdue) across scoped projects' members; top-5-busiest ranking; capacity buckets (Available `<5` / Near Capacity `5-10` / Overloaded `>10` assigned issues, as tunable constants) | New component, not re-used from `WorkloadSummaryWidget` (which only covers the viewer's own workload) |
| Recent Project Activity | Reuses existing activity-feed query shape, filtered to scoped project IDs via `issues.project_id` | Renamed label per user's answer; scope is "your projects", not whole org |
| My Projects Overview | `GET /dashboard/member/project-health`, same keyset SQL as Owner, filtered to scoped IDs | Columns: Project, Key, Status, Open Issues, Overdue Issues, Active Sprint, Progress |

### Query budget

Composite endpoint: 5 parallel round-trips on cache miss (KPIs+members, issue-status
donut, active sprints, team workload, activity series+feed) — one more than the
Owner's 4, due to the two new widget dimensions.

## Frontend design

- `services/web/src/pages/DashboardPage.tsx` content is fully replaced. Route,
  auth requirements, and position in `RootRoute`/sidebar routing are unchanged.
- **Reused as-is:** `kpi-stat-card` (×5), `health-donut-chart`/`dashboard-donut`
  primitives (fed the new issue-status data instead of project-health data),
  `activity-pulse-chart` (feed half only, relabeled "Recent Project Activity"),
  `project-health-table` (columns adjusted to the image), `dashboard-panel-card`,
  shared chart theme/tooltip/legend.
- **New components** (`components/dashboard/active-sprint-overview.tsx`,
  `components/dashboard/team-workload.tsx`): these are **not** extractions of the
  existing inline `MiniBurndownWidget`/`WorkloadSummaryWidget` in `DashboardPage.tsx`,
  despite earlier framing during design discussion — those existing widgets render a
  single sprint's burndown line chart and the *viewer's own* workload only, which is a
  different data shape than the image's multi-sprint progress-ring list and
  org-member workload distribution. The old inline widgets
  (`MiniBurndownWidget`, `VelocityWidget`, `WorkloadSummaryWidget`) are unexported,
  used only within `DashboardPage.tsx`, and are deleted when the file is replaced —
  confirmed no other file imports them.
- `SprintIntelligenceWidget` — kept, rendered below the new Active Sprint Overview
  panel (existing component, existing hook, unchanged).
- Header: generic greeting (`Good morning/afternoon/evening, {name}`), same as
  today — not a role-specific title.
- Header action buttons (Create Project, Invite Member, View Reports) — reuse the
  same dialogs as existing pages (`CreateProjectDialog`, `InviteMemberDialog`),
  permission-gated via the existing `useHasPermission` hook the same way other pages
  already gate these actions.
- Range control: existing 7d/30d toggle pattern (not the image's custom week-picker
  — see Open Decisions).
- New hook: `useMemberDashboard(range)` in `services/web/src/hooks/`, structured
  like the existing `useOrgDashboard.ts` (same response-typing conventions).

## Data flow

1. Page mounts → `useMemberDashboard(range)` → `GET /dashboard/member?range=`.
2. Backend: Redis lookup → miss → acquire distributed lock → 5 parallel SQL queries →
   write cache → respond. Cache hit skips straight to response.
3. Separately, `useInfiniteQuery` drives `GET /dashboard/member/project-health` for
   the projects table — independent of the composite call and of the range toggle,
   exactly like the Owner dashboard's existing project-health pagination.
4. Toggling 7d/30d re-fetches only the composite call, not the project table.

## Error handling

- Zero scoped projects (new user, or a Viewer added to nothing) → existing
  `EmptyState` component, prompting to create or join a project.
- Initial load → `CardGridSkeleton`; range switch keeps previous data visible via
  TanStack Query `keepPreviousData`, matching existing hook conventions.
- Action buttons are hidden/disabled per existing permission-gating conventions
  (e.g. a Viewer without `project:create` won't see "Create Project").
- All queries enforce `organization_id` scoping in addition to the per-user project-ID
  filter — required tenant isolation per CLAUDE.md.

## Testing plan

- **Backend unit tests:**
  - Scope resolution: owner-of vs member-of vs neither (project must not appear in
    scoped IDs if the user has no relation to it).
  - KPI edge cases: 0 scoped projects, 0 issues.
  - Issue-status donut aggregation correctness.
  - Team workload capacity-bucket threshold boundaries.
  - Active-sprint %-complete math (0 issues in sprint, all done, partial).
- **Tenant-isolation test (required by CLAUDE.md `/qa` gate):** a member in Org A must
  never see Org B's scoped data via either endpoint; a member must see only their
  own + enrolled projects, never unrelated org projects.
- **Frontend tests:** new components (`active-sprint-overview`, `team-workload`)
  with mocked payloads; empty-state rendering with 0 scoped projects; range-toggle
  refetch behavior; permission-gated action buttons hidden for Viewer role.
- **Manual QA:** against `boardupscale_testing` DB using the seeded Administrator
  account plus a Member and Viewer account, visually compared against the reference
  image.

## Open decisions carried forward (explicit, not blocking)

1. **Date-range control:** design uses the existing 7d/30d toggle instead of the
   image's custom "This Week (Jun 09 – Jun 15)" dropdown, to avoid building a new
   date-picker component for a single page. Flagged to the user during design
   presentation; no objection raised.
2. **Capacity-bucket thresholds** (Available `<5` / Near Capacity `5-10` /
   Overloaded `>10` assigned issues) are a starting heuristic, implemented as a
   named constant so they're easy to tune later without a migration.
