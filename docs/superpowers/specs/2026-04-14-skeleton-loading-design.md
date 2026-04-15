# Skeleton Loading System — Design Spec

## Problem

Every page in Boardupscale shows a single centered spinner (`<LoadingPage />`) while data loads. This blanks the entire screen, feels slow, and provides no sense of what content is coming. 14 pages do a full-page blank; 8 more show inline spinners. Component-level loading is inconsistent — at least 5 different ad-hoc spinner patterns exist.

## Goal

Replace all full-page spinners with contextual skeleton loaders that mirror the shape of the incoming content. The result should feel fast, polished, and professional — on par with Linear, Notion, and GitHub.

## Design Principles

1. **Page chrome renders immediately** — Headers, tab nav, sidebar links appear instantly. Only the content area shows a skeleton.
2. **Shape fidelity** — Skeletons match the layout of the real content. Avatars are circles, badges are pills, text lines vary in width.
3. **Shimmer animation** — A left-to-right gradient sweep (not just pulse) that feels alive and fast.
4. **Staggered reveal** — Skeleton rows cascade in with 50ms delays, creating a "filling in" effect.
5. **Smooth crossfade** — Real content fades in via `transition-opacity duration-300` instead of a hard swap.
6. **Dark mode aware** — Shimmer uses `bg-muted` base with a contextual highlight that works on both themes.
7. **Consistency** — Every loading state in the app uses the same skeleton system.

---

## Skeleton Primitive

### `Skeleton` component (rebuilt)

**File:** `services/web/src/components/ui/skeleton.tsx`

The base `Skeleton` div gets a shimmer animation instead of `animate-pulse`:

- **Base:** `bg-muted rounded-md` with `overflow-hidden relative`
- **Shimmer overlay:** A `::before` pseudo-element with a `linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)` that translates left-to-right over 1.5s on infinite loop
- **Dark mode:** The gradient highlight is `rgba(255,255,255,0.06)` in dark, `rgba(255,255,255,0.5)` in light
- **Props:** `className` for size overrides, `rounded` variant for circles (`rounded-full`)

### Tailwind keyframe (add to `tailwind.config.ts`)

```
shimmer: {
  '0%': { transform: 'translateX(-100%)' },
  '100%': { transform: 'translateX(100%)' },
}
```

Animation: `shimmer 1.5s ease-in-out infinite`

### Stagger wrapper

A `SkeletonRow` wrapper that accepts an `index` prop and applies `opacity: 0 -> 1` with `animationDelay: index * 50ms` using the `animate-in fade-in` utility. Keeps each row's entrance staggered.

### Crossfade wrapper

A `ContentFade` wrapper component:
```tsx
function ContentFade({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in duration-300">{children}</div>
}
```

Applied around the real content when `isLoading` becomes false.

---

## 7 Skeleton Templates

### 1. `TableSkeleton`

**Used by:** ProjectIssuesPage, MyIssuesPage, ProjectTrashPage, AuditLogPage, TimesheetPage (x2 views), ProjectBacklogPage (issue rows)

**Layout:**
```
[ pill ] [ pill ] [ pill ]              ← 3 filter placeholder pills
─────────────────────────────────────
[ __ ] [ ________ ] [ ___ ] [ __ ] [ _ ] ← header row (5 columns, muted text-height)
[ O ] [ __________ ] [ __ ] [ ___ ] [ _ ] ← data row (circle + text lines + pills)
[ O ] [ _______ ]    [ __ ] [ ___ ] [ _ ] ← varying text widths per row
... 8 rows total
```

- First column: 32px circle (avatar) or 16px square (checkbox)
- Second column: text line at 60-90% random-ish width (use fixed pattern: 85%, 70%, 90%, 60%, 75%, 80%, 65%, 72%)
- Third column: small pill (status badge shape)
- Fourth column: medium text block
- Fifth column: short text (date)
- Rows stagger in with 50ms delay each

**Props:** `rows?: number` (default 8), `columns?: number` (default 5), `showFilters?: boolean` (default true)

---

### 2. `KanbanSkeleton`

**Used by:** ProjectBoardPage

**Layout:**
```
[ _________ ]  [ _________ ]  [ _________ ]  [ _________ ]
  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
  │ _______ │   │ _______ │   │ _____ _ │   │ _______ │
  │ ____ __ │   │ ____ __ │   │ ____ __ │   │ _____ _ │
  │ O    __ │   │ O    __ │   │ O    __ │   │ O    __ │
  └─────────┘   └─────────┘   └─────────┘   └─────────┘
  ┌─────────┐   ┌─────────┐   ┌─────────┐
  │ ...     │   │ ...     │   │ ...     │
  └─────────┘   └─────────┘   └─────────┘
```

- 4 columns, each `w-[280px]`
- Column header: rounded bar at top
- Cards per column: 3, 4, 2, 3 (varied to feel natural)
- Each card: rounded-xl border, title line (80% width), subtitle line (50%), bottom row with circle (avatar) + small text
- Columns stagger in left-to-right

**Props:** `columns?: number` (default 4)

---

### 3. `DetailSkeleton`

**Used by:** IssueDetailPage

**Layout:**
```
Left (flex-1)                    │ Right (w-80)
                                 │
[ ___ > ___ > _______ ]          │ [ label ] [ _______ ]
[ ________________________ ]     │ [ label ] [ O _____ ]
[ _______________ ]              │ [ label ] [ _______ ]
[ __________________ ]           │ [ label ] [ _______ ]
[ _________ ]                    │ [ label ] [ _______ ]
                                 │ [ label ] [ _______ ]
[ O ] [ _____________ ]          │
[     [ _________ ]   ]          │
[ O ] [ _________________ ]      │
[     [ ____________ ]    ]      │
```

- Left: breadcrumb bar + title (h-8 w-3/4) + 3 description text blocks (varying widths) + 2 comment blocks (avatar circle + 2 text lines)
- Right sidebar: 6 field rows, each with a small label (w-16 h-3) and a value block (w-full h-8)
- Responsive: sidebar stacks below on mobile

---

### 4. `CardGridSkeleton`

**Used by:** ProjectsPage, DashboardPage, ProjectReleasesPage, NotificationsPage

**Layout:**
```
[ stat card ] [ stat card ] [ stat card ]    ← 3 stat cards (icon + number + label)
─────────────────────────────────────────
┌──────────┐ ┌──────────┐ ┌──────────┐
│ ________ │ │ ________ │ │ ________ │     ← 2x3 content card grid
│ _____ __ │ │ _____ __ │ │ _____ __ │
│ ____ ___ │ │ ____ ___ │ │ ____ ___ │
│ [__] [__]│ │ [__] [__]│ │ [__] [__]│     ← footer with pills
└──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐
│ ...      │ │ ...      │ │ ...      │
└──────────┘ └──────────┘ └──────────┘
```

- Stat cards: 3 side-by-side, each with a circle icon placeholder + number line + label line
- Content cards: rounded-xl border, icon/image area + title + 2 text lines + footer pills
- Cards stagger in

**Props:** `stats?: number` (default 3), `cards?: number` (default 6), `columns?: number` (default 3)

---

### 5. `SettingsSkeleton`

**Used by:** ProjectSettingsPage, UserSettingsPage, WebhooksPage, RoleManagementPage, TeamPage, BillingPage

**Layout:**
```
Left nav (w-48)        │ Right content
                       │
[ _______ ]  active    │ [ ________________ ]  ← section heading
[ _______ ]            │
[ _______ ]            │ [ label ]
[ _______ ]            │ [ ________________ ]  ← input field
[ _______ ]            │
[ _______ ]            │ [ label ]
                       │ [ ________________ ]  ← input field
                       │
                       │ [ label ]
                       │ [ ________________ ]  ← textarea
                       │
                       │ [ ====== ]            ← button
```

- Left: 6 nav items (text bars, first one highlighted)
- Right: section heading + 4 label/input pairs + 1 button placeholder
- If the page has no sidebar nav (e.g. TeamPage), skip the left column and show a heading + list rows

**Props:** `showNav?: boolean` (default true), `fields?: number` (default 4)

**Variant — `TeamSkeleton`:** heading + invite button placeholder + 6 member rows (avatar circle + name line + email line + role pill + action dots)

---

### 6. `ChartSkeleton`

**Used by:** ProjectReportsPage (all 9 chart tabs), ProjectTimelinePage, ProjectCalendarPage

**Layout:**
```
        │
   ──── │ ┌─────────────────────────────┐
   ──── │ │                             │
   ──── │ │      chart area             │
   ──── │ │      (faint grid lines)     │
   ──── │ │                             │
        │ └─────────────────────────────┘
        └───┬────┬────┬────┬────┬────┬──
            [ ] [ ] [ ] [ ] [ ] [ ]        ← x-axis labels
```

- Y-axis: 5 tick marks (short horizontal lines)
- X-axis: 6 label placeholders
- Chart area: large rounded rectangle with 4 faint horizontal grid lines inside
- Subtle, minimal — the shimmer on the chart area does the heavy lifting

**Props:** `height?: string` (default `h-[400px]`)

**Variant — `CalendarSkeleton`:** 7-column grid header (day names) + 5 rows of day cells (each with a small number + 1-2 tiny pill shapes)

---

### 7. `ListSkeleton`

**Used by:** NotificationsPage (feed), AutomationRules list, Activity/comment feeds

**Layout:**
```
[ O ] [ __________________ ] [ _____ ]
[   ] [ ____________ ]
─────────────────────────────────────
[ O ] [ ________________ ]   [ _____ ]
[   ] [ __________ ]
─────────────────────────────────────
...
```

- Each row: left circle (icon/avatar) + 2 text lines (title at 70-90%, subtitle at 50-70%) + right timestamp
- Divided by border lines
- 6 rows default, staggered

**Props:** `rows?: number` (default 6)

---

## Page-by-Page Mapping

### Full-page `<LoadingPage />` early returns to convert

| Page | File | Template | Notes |
|------|------|----------|-------|
| Board | `ProjectBoardPage.tsx` | `KanbanSkeleton` | Render after PageHeader + sprint banner |
| Backlog | `ProjectBacklogPage.tsx` | `TableSkeleton` | Render after PageHeader; show 2 sprint section shapes + issue rows |
| Issue Detail | `IssueDetailPage.tsx` | `DetailSkeleton` | Full two-column skeleton |
| Project Settings | `ProjectSettingsPage.tsx` | `SettingsSkeleton` | Render settings nav immediately, skeleton in content pane |
| User Settings | `UserSettingsPage.tsx` | `SettingsSkeleton` | Same pattern — nav + form skeleton |
| Team | `TeamPage.tsx` | `SettingsSkeleton` (TeamSkeleton variant) | Member rows with avatars |
| Automations | `ProjectAutomationsPage.tsx` | `ListSkeleton` | Render after PageHeader |
| Webhooks | `WebhooksPage.tsx` | `ListSkeleton` | Render after PageHeader |
| Releases | `ProjectReleasesPage.tsx` | `CardGridSkeleton` | Stats + version cards |
| Timeline | `ProjectTimelinePage.tsx` | `ChartSkeleton` | Gantt-style area |
| Calendar | `ProjectCalendarPage.tsx` | `ChartSkeleton` (CalendarSkeleton variant) | Calendar grid |
| Roles | `RoleManagementPage.tsx` | `SettingsSkeleton` | Permission matrix placeholder |
| Timesheet (My) | `TimesheetPage.tsx` | `TableSkeleton` | Inside tab content |
| Timesheet (Team) | `TimesheetPage.tsx` | `TableSkeleton` | Inside tab content |
| Billing | `BillingPage.tsx` | `SettingsSkeleton` | Plan cards + usage meters |

### Inline `<LoadingPage />` to convert

| Page | File | Template | Notes |
|------|------|----------|-------|
| Dashboard | `DashboardPage.tsx` | `CardGridSkeleton` | Stats + project cards + issue table |
| Projects | `ProjectsPage.tsx` | `CardGridSkeleton` | Stats always visible, skeleton for card grid |
| Issues | `ProjectIssuesPage.tsx` | `TableSkeleton` | Filters always visible, skeleton for table |
| My Issues | `MyIssuesPage.tsx` | `TableSkeleton` | Stats always visible, skeleton for table |
| Notifications | `NotificationsPage.tsx` | `ListSkeleton` | Stats always visible, skeleton for feed |
| Audit Logs | `AuditLogPage.tsx` | `TableSkeleton` | Filters always visible, skeleton for table |
| Trash | `ProjectTrashPage.tsx` | `TableSkeleton` | Toolbar visible, skeleton for table |
| Reports | `ProjectReportsPage.tsx` | `ChartSkeleton` | Tab nav visible, skeleton per chart panel |
| Pages | `ProjectPagesPage.tsx` | `ListSkeleton` | Sidebar tree skeleton |

### Component-level spinners to fix

| Component | File | Replace With |
|-----------|------|-------------|
| GitHubConnection | `github-connection.tsx` | Inline `Skeleton` blocks (3 field rows) |
| ActivityList | `activity-list.tsx` | `ListSkeleton rows={4}` |
| AiUsageDashboard | `AiUsageDashboard.tsx` | `CardGridSkeleton stats={4} cards={0}` |
| ExecutionLog | `execution-log.tsx` | `ListSkeleton rows={3}` |
| OrgSwitcher | `org-switcher.tsx` | 2 `Skeleton` bars inline |
| WebhookDeliveries | `WebhooksPage.tsx` | `TableSkeleton rows={3}` |
| SearchModal | `search-modal.tsx` | 3 `Skeleton` result rows |

---

## Implementation Order

1. **Skeleton primitive** — Rebuild `skeleton.tsx` with shimmer animation, `SkeletonRow` stagger wrapper, `ContentFade` transition wrapper
2. **Tailwind config** — Add shimmer keyframe
3. **7 templates** — Build all skeleton templates in `skeleton.tsx`
4. **Pages (batch 1)** — Board, Backlog, Issue Detail, Project Settings (highest-traffic pages)
5. **Pages (batch 2)** — Dashboard, Projects, Issues, My Issues
6. **Pages (batch 3)** — All remaining pages (Team, Reports, Notifications, etc.)
7. **Components** — Fix all component-level spinners
8. **Cleanup** — Remove unused `LoadingPage` import from pages that no longer need it

---

## Out of Scope

- Optimistic UI / instant loading from cache (TanStack Query `staleTime` tuning) — separate concern
- Server-side rendering / streaming — not in the current stack
- Lazy-loaded route `Suspense` fallback in `App.tsx` — keep as-is (brief flash during chunk download is fine)

---

## Success Criteria

- Zero pages show a full-page blank spinner when loading
- Every loading state uses a skeleton that matches the content shape
- Shimmer animation runs smoothly at 60fps
- Dark mode and light mode both look polished
- Real content fades in smoothly when data arrives
