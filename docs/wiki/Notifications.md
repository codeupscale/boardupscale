# In-App Notifications System

Boardupscale delivers multi-tenant in-app notifications with real-time WebSocket delivery, optional sounds, and a hybrid sync/BullMQ fan-out path.

---

## Architecture

```
Domain event (issue/comment/project/org)
        │
        ▼
NotificationsService.notify()
  • dedupe recipients
  • exclude actor (unless includeActor)
  • filter inApp preference (single DB query)
        │
        ├─ 1 recipient ──► create() ──► Postgres + Socket.io emit
        │
        └─ 2+ recipients ──► BullMQ notify-batch
                                  │
                                  ▼
                         Worker insert + Redis publish
                                  │
                                  ▼
                         API gateway → Socket.io (notification:new)
                                  │
                                  ▼
                         FE useNotificationSocket
                           • update badge/list (all tabs)
                           • toast + sound (one tab only)
```

**Contract:** Always call `NotificationsService.notify()`. Never enqueue `notify-batch` with raw user IDs — the worker trusts the pre-filtered list and does **not** re-check `inApp` preferences.

---

## Recipients & roles

| Event                          | Type                     | Who gets it                                                  | Sound                     |
| ------------------------------ | ------------------------ | ------------------------------------------------------------ | ------------------------- |
| Ticket created (no assignee)   | `issue:created`          | Creator + **project** admins (`admin` / `owner` / `manager`) | Yes (`create-ticket.mp3`) |
| Ticket created (with assignee) | `issue:created`          | Creator + project admins + assignee                          | Yes                       |
| Ticket reassigned              | `issue:assigned`         | New assignee                                                 | Yes (`ticket-assign.mp3`) |
| Ticket deleted                 | `issue:deleted`          | Project admins + assignee + reporter (actor excluded)        | Yes                       |
| Status changed                 | `issue:status_changed`   | Assignee, reporter, watchers (actor excluded)                | No                        |
| Priority changed               | `issue:priority_changed` | Assignee, reporter, watchers (actor excluded)                | No                        |
| Comment                        | `comment:created`        | Assignee, reporter, watchers (actor excluded)                | No                        |
| Mention                        | `mention`                | Project members only (org-wide mention IDs filtered)         | Yes (`mentions.mp3`)      |
| Project created                | `project:created`        | Creator (`includeActor`)                                     | Yes                       |
| Project archived               | `project:deleted`        | Org owners + administrators                                  | No                        |
| Added to project               | `project:member_added`   | Added user                                                   | Yes (`ticket-assign.mp3`) |
| Added to organization          | `org:member_added`       | Added user (existing accepted account)                       | No                        |
| Sprint started                 | `sprint:started`         | All project members (actor excluded)                         | No                        |
| Sprint completed               | `sprint:completed`       | All project members (actor excluded)                         | No                        |

### Scope rules

- **Project admins** = `project_members.role` in `admin | owner | manager` for that project only. Org owner/admin without a project membership row does **not** get ticket-create noise.
- **Mentions** are project-scoped: TipTap HTML + legacy `@[Name](id)` + plain `@word` are parsed, then filtered to project members.
- **Actor exclusion** is default. Ticket/project create uses `includeActor: true` so the creator is notified.

### Explicitly not notified (product)

- Due date changes

(Webhooks/automation triggers may still fire; in-app inbox does not.)

---

## Preferences

Stored on `users.notificationPreferences`:

| Key     | Default | Effect                                                                                                                            |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `email` | `true`  | Email side-channels (assign/mention emails)                                                                                       |
| `inApp` | `true`  | Persist + socket delivery                                                                                                         |
| `sound` | `true`  | Client MP3 when tab visible and type is sound-enabled. **Requires `inApp` on** — UI disables and clears sound when in-app is off. |

Settings UI: **User Settings → Notifications**.

---

## Frontend UX

### Bell panel (`NotificationsPanel`)

- Right sheet; does not navigate away from the current page
- Filters: **All / Unread / Mentions / Assigned**
- **Comment & mention rows** (`comment:created`, `mention`):
  - **Collapsed (default):** concise summary (e.g. “User X commented on TPROJ-1”), issue title, timestamp — no comment body
  - **Chevron expand:** loads full comment HTML on demand via `GET /comments/:id`; scrollable preview inside the row
  - **Summary click:** mark read + navigate to issue (chevron does neither)
- **Other types:** title + timestamp only (no body preview)
- “View all” → `/notifications`

### Full page (`/notifications`)

- Same filter tabs and comment/mention expand behavior as the panel
- Summary cards: total / unread / read
- Grouped by Today / Yesterday / Earlier

### Sounds

| Types                                               | File                        |
| --------------------------------------------------- | --------------------------- |
| `issue:created`, `issue:deleted`, `project:created` | `/sounds/create-ticket.mp3` |
| `issue:assigned`, `project:member_added`            | `/sounds/ticket-assign.mp3` |
| `mention`                                           | `/sounds/mentions.mp3`      |

- Volume = 1
- Silent unlock on first click/tap (browser autoplay policy)
- Skipped when tab is not visible or sound pref is off

### Multi-tab dedupe (same browser profile)

When multiple Boardupscale tabs are open:

1. **Every tab** updates inbox list + unread badge from `notification:new`.
2. **Only one tab** claims toast + sound via `localStorage` lock + `BroadcastChannel` (`notification-tab-coordinator.ts`).

Result: one notification in the product = one toast/sound, not N copies.

> Separate Chrome profiles / browsers each have their own session and do not share this lock.

---

## Real-time & sockets

| Event                          | Purpose                        |
| ------------------------------ | ------------------------------ |
| `notification:new`             | New inbox item payload         |
| `notification:count`           | Absolute unread count for org  |
| `notification:count-increment` | Fallback if worker omits count |
| `notification:read`            | Single item marked read        |
| `notification:all-read`        | Org inbox cleared              |

FE drops events whose `organizationId` ≠ active JWT org.

Polling fallback: 120s when socket connected, 15s when disconnected. List/unread endpoints use `Cache-Control: no-store`.

---

## Data model

`notifications` table (tenant-scoped):

- `organization_id` (required, indexed with user + created_at)
- `user_id`, `type`, `title`, `body`, `data` (jsonb), `read_at`, `created_at`

Migration: `1748300000000-AddNotificationOrganizationId.ts`

---

## API surface

| Method          | Path                                  | Notes                       |
| --------------- | ------------------------------------- | --------------------------- |
| `GET`           | `/notifications?filter=&page=&limit=` | Org-scoped list             |
| `GET`           | `/notifications/unread-count`         | `{ count, organizationId }` |
| `GET`           | `/comments/:id`                       | Single comment for inbox preview (tenant-scoped) |
| `GET` / `PATCH` | `/notifications/preferences`          | User prefs                  |
| `PATCH`         | `/notifications/:id/read`             | Tenant + user scoped        |
| `POST`          | `/notifications/read-all`             | Active org only             |

Auth: JWT. All list/read mutations scoped by `@OrgId()`.

---

## Known follow-ups (not in this delivery)

1. **Desktop Notification API** — OS toast + sound when Boardupscale tab is open but the user is in another window/app (e.g. Slack). In-tab MP3 cannot reliably play from a background Chrome window.
2. **Web Push + service worker** — alerts when the Boardupscale tab is fully closed.
3. Remove legacy unused worker job types that still insert stale notification types if enqueued from older paths.

---

## Key files

| Area            | Path                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| Dispatch        | `services/api/src/modules/notifications/notifications.service.ts`         |
| Audience        | `services/api/src/modules/notifications/notification-audience.service.ts` |
| Constants       | `services/api/src/modules/notifications/notification.constants.ts`        |
| Worker          | `services/worker/src/notification/notification.worker.ts`                 |
| Socket relay    | `services/api/src/websocket/events.gateway.ts`                            |
| FE socket/hooks | `services/web/src/hooks/useNotifications.ts`                              |
| Multi-tab       | `services/web/src/lib/notification-tab-coordinator.ts`                    |
| Sound           | `services/web/src/lib/notification-sound.ts`                              |
| Panel / page    | `NotificationsPanel.tsx`, `NotificationsPage.tsx`, `CommentNotificationRow.tsx` |
