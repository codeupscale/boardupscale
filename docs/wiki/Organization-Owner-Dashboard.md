# Organization Owner Dashboard

Owner-only overview of organization projects, members, and activity.

## Route

- **Web:** `/org/dashboard` (role: Organization Owner)
- **Personal dashboard** remains at `/dashboard` for all users

## API

### Composite dashboard

`GET /api/dashboard/organization?range=7d|30d`

- Auth: JWT + `@Roles('owner')`
- Payload: KPIs, **Member Management Snapshot**, projects-by-status **counts**, activity series + feed
- Does **not** embed the full project-health row list (scale)
- HTTP: `Cache-Control: no-store`
- App cache: Redis key `dash:org:{orgId}:owner:{range}:v4` TTL 30s (fail-open)

### Project health (infinite scroll)

`GET /api/dashboard/organization/project-health?status=all|active|at_risk|blocked|completed&limit=25&cursor=`

- Auth: JWT + `@Roles('owner')`
- Keyset pagination (status severity → name → project id); never OFFSET for deep pages
- Response: `{ items, nextCursor, total }`
- HTTP: `Cache-Control: no-store`; short Redis page cache (~20s)

Classification rules are applied in **SQL** (same as `classifyProjectHealth`) so filters and ordering stay correct at 1000+ projects.

## Query budget (composite)

On cache miss, **exactly 4** parallel SQL round-trips:

1. KPI scalars + Member Management Snapshot
2. Project health **status counts** (set-based `GROUP BY`)
3. Activity counts by day
4. Latest activity feed rows

Indexes (migration `1748400000000-AddOrgDashboardIndexes`): activities, issues (alive), issue_links, organization_members created_at, **projects (organization_id, name, id)**.

## Member Management Snapshot

| Metric | Source |
|--------|--------|
| Total members | `organization_members` count |
| Members trend (A) | Members with `created_at` in current UTC month |
| Pending invites | `users.invitation_status = pending` for this org |
| Pending trend (A) | pending created this month − invites accepted this month |
| Active invitations | Pending with `email_verification_expiry > now()` |

### Role distribution

**Distinct user + highest-role precedence:** Org Owner → Org Administrator → Project Admin → Project Member → Project Viewer → Org User. Multi-project memberships count once.

## Project Health Overview (UI)

- Viewport shows **~10 rows**; scroll loads more via `useInfiniteQuery` + `@tanstack/react-virtual`
- Status filter from **Projects by Status** donut is applied **server-side**
- Sticky header; footer shows “Showing X of Y”

## Actions (parity with other pages)

- **New Project** — same `CreateProjectDialog` as Projects page
- **Invite Member** — same `InviteMemberDialog` as Team settings (including Jira force-create confirm)

## Project health rules

| Status | Rule |
|--------|------|
| **Blocked** | Project has **0 tickets** |
| **Completed / Done** | open=0, blocked=0, overdue=0, every ticket done |
| **At Risk** | open ≥ 5 **and** overdue ≥ 3 |
| **Active** | Has open and/or overdue work, but not At Risk |

## Security alerts

KPI deferred: `0` with `comingSoon: true`.
