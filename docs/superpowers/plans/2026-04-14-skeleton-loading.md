# Skeleton Loading System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every full-page spinner with contextual skeleton loaders that mirror the shape of each page's content, using a shimmer animation, staggered reveal, and smooth crossfade.

**Architecture:** A single `skeleton.tsx` file exports the `Skeleton` primitive (with shimmer), helper wrappers (`SkeletonRow`, `ContentFade`), and 7 reusable template components. Each page imports the appropriate template and renders it inline (keeping page chrome visible) instead of returning `<LoadingPage />`.

**Tech Stack:** React 18, Tailwind CSS v4 (`@import "tailwindcss"` — no tailwind.config), CSS `@keyframes` for shimmer, `tw-animate-css` for fade-in utilities.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `services/web/src/index.css` | Add `@keyframes shimmer` animation |
| Rewrite | `services/web/src/components/ui/skeleton.tsx` | Skeleton primitive + 7 templates + helpers |
| Modify | `services/web/src/pages/ProjectBoardPage.tsx` | KanbanSkeleton |
| Modify | `services/web/src/pages/ProjectBacklogPage.tsx` | TableSkeleton |
| Modify | `services/web/src/pages/IssueDetailPage.tsx` | DetailSkeleton |
| Modify | `services/web/src/pages/ProjectSettingsPage.tsx` | SettingsSkeleton |
| Modify | `services/web/src/pages/DashboardPage.tsx` | CardGridSkeleton |
| Modify | `services/web/src/pages/ProjectsPage.tsx` | CardGridSkeleton |
| Modify | `services/web/src/pages/ProjectIssuesPage.tsx` | TableSkeleton |
| Modify | `services/web/src/pages/MyIssuesPage.tsx` | TableSkeleton |
| Modify | `services/web/src/pages/UserSettingsPage.tsx` | SettingsSkeleton |
| Modify | `services/web/src/pages/TeamPage.tsx` | SettingsSkeleton (TeamSkeleton) |
| Modify | `services/web/src/pages/ProjectAutomationsPage.tsx` | ListSkeleton |
| Modify | `services/web/src/pages/WebhooksPage.tsx` | ListSkeleton |
| Modify | `services/web/src/pages/ProjectReleasesPage.tsx` | CardGridSkeleton |
| Modify | `services/web/src/pages/ProjectTimelinePage.tsx` | ChartSkeleton |
| Modify | `services/web/src/pages/ProjectCalendarPage.tsx` | ChartSkeleton |
| Modify | `services/web/src/pages/RoleManagementPage.tsx` | SettingsSkeleton |
| Modify | `services/web/src/pages/TimesheetPage.tsx` | TableSkeleton |
| Modify | `services/web/src/pages/BillingPage.tsx` | SettingsSkeleton |
| Modify | `services/web/src/pages/NotificationsPage.tsx` | ListSkeleton |
| Modify | `services/web/src/pages/AuditLogPage.tsx` | TableSkeleton |
| Modify | `services/web/src/pages/ProjectTrashPage.tsx` | TableSkeleton |
| Modify | `services/web/src/pages/ProjectReportsPage.tsx` | ChartSkeleton |
| Modify | `services/web/src/pages/ProjectPagesPage.tsx` | ListSkeleton |
| Modify | `services/web/src/components/projects/github-connection.tsx` | Skeleton inline |
| Modify | `services/web/src/components/issues/activity-list.tsx` | ListSkeleton |
| Modify | `services/web/src/components/ai/AiUsageDashboard.tsx` | CardGridSkeleton |
| Modify | `services/web/src/components/automation/execution-log.tsx` | ListSkeleton |
| Modify | `services/web/src/components/layout/org-switcher.tsx` | Skeleton inline |
| Modify | `services/web/src/components/layout/search-modal.tsx` | Skeleton inline |

---

## Task 1: Shimmer keyframe + Skeleton primitives

**Files:**
- Modify: `services/web/src/index.css` (add keyframes after line ~591)
- Rewrite: `services/web/src/components/ui/skeleton.tsx`

- [ ] **Step 1: Add shimmer keyframes to index.css**

At the end of the existing `@keyframes` section (after the `loginOrb` keyframes around line 591), add:

```css
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

- [ ] **Step 2: Rewrite skeleton.tsx with the Skeleton primitive, SkeletonRow, and ContentFade**

Replace the entire content of `services/web/src/components/ui/skeleton.tsx` with:

```tsx
import { cn } from '@/lib/utils'

// ── Skeleton Primitive ──────────────────────────────────────────────────────
// A shimmer-animated placeholder block. Use className to set size.
// Pass `circle` for avatar placeholders.

interface SkeletonProps {
  className?: string
  circle?: boolean
}

export function Skeleton({ className, circle }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        circle ? 'rounded-full' : 'rounded-md',
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }}
      />
    </div>
  )
}

// ── Staggered Row ───────────────────────────────────────────────────────────
// Wraps a skeleton row with a staggered fade-in based on its index.

interface SkeletonRowProps {
  index: number
  children: React.ReactNode
  className?: string
}

export function SkeletonRow({ index, children, className }: SkeletonRowProps) {
  return (
    <div
      className={cn('animate-in fade-in duration-300 fill-mode-both', className)}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {children}
    </div>
  )
}

// ── Content Fade ────────────────────────────────────────────────────────────
// Wraps real content for a smooth fade-in when loading completes.

export function ContentFade({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('animate-in fade-in duration-300', className)}>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add services/web/src/index.css services/web/src/components/ui/skeleton.tsx
git commit -m "feat: rebuild Skeleton primitive with shimmer animation, SkeletonRow, ContentFade"
```

---

## Task 2: Build all 7 skeleton templates

**Files:**
- Modify: `services/web/src/components/ui/skeleton.tsx` (append templates)

- [ ] **Step 1: Add TableSkeleton template**

Append to `skeleton.tsx`:

```tsx
// ── Table Skeleton ──────────────────────────────────────────────────────────

const TEXT_WIDTHS = ['85%', '70%', '90%', '60%', '75%', '80%', '65%', '72%']

interface TableSkeletonProps {
  rows?: number
  showFilters?: boolean
}

export function TableSkeleton({ rows = 8, showFilters = true }: TableSkeletonProps) {
  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      )}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 bg-muted/30 border-b border-border">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} index={i}>
            <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0">
              <Skeleton className="h-8 w-8" circle />
              <Skeleton className="h-4 flex-1" style={{ maxWidth: TEXT_WIDTHS[i % TEXT_WIDTHS.length] }} />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </SkeletonRow>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add KanbanSkeleton template**

Append to `skeleton.tsx`:

```tsx
// ── Kanban Skeleton ─────────────────────────────────────────────────────────

const CARDS_PER_COL = [3, 4, 2, 3]

interface KanbanSkeletonProps {
  columns?: number
}

export function KanbanSkeleton({ columns = 4 }: KanbanSkeletonProps) {
  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {Array.from({ length: columns }).map((_, colIdx) => (
        <SkeletonRow key={colIdx} index={colIdx} className="flex-shrink-0 w-[280px]">
          <div className="space-y-3">
            {/* Column header */}
            <div className="flex items-center gap-2 px-1">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            {/* Cards */}
            {Array.from({ length: CARDS_PER_COL[colIdx % CARDS_PER_COL.length] }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="rounded-xl border border-border bg-card p-3 space-y-2.5"
              >
                <Skeleton className="h-4" style={{ width: `${75 - cardIdx * 10}%` }} />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-6 w-6" circle />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonRow>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Add DetailSkeleton template**

Append to `skeleton.tsx`:

```tsx
// ── Detail Skeleton ─────────────────────────────────────────────────────────

export function DetailSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left content */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-32" />
        </div>
        {/* Title */}
        <Skeleton className="h-8 w-3/4" />
        {/* Description blocks */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[75%]" />
        </div>
        <Skeleton className="h-4 w-[60%]" />
        {/* Comments */}
        <div className="space-y-4 pt-4 border-t border-border">
          {[0, 1].map((i) => (
            <SkeletonRow key={i} index={i + 4}>
              <div className="flex gap-3">
                <Skeleton className="h-8 w-8 flex-shrink-0" circle />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[70%]" />
                </div>
              </div>
            </SkeletonRow>
          ))}
        </div>
      </div>
      {/* Right sidebar */}
      <div className="w-full lg:w-80 xl:w-[340px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} index={i}>
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-full" />
              </div>
            </SkeletonRow>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CardGridSkeleton template**

Append to `skeleton.tsx`:

```tsx
// ── Card Grid Skeleton ──────────────────────────────────────────────────────

interface CardGridSkeletonProps {
  stats?: number
  cards?: number
  columns?: number
}

export function CardGridSkeleton({ stats = 3, cards = 6, columns = 3 }: CardGridSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      {stats > 0 && (
        <div className={cn('grid gap-4', `grid-cols-1 sm:grid-cols-${stats}`)}>
          {Array.from({ length: stats }).map((_, i) => (
            <SkeletonRow key={i} index={i}>
              <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <Skeleton className="h-10 w-10" circle />
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </SkeletonRow>
          ))}
        </div>
      )}
      {/* Content cards */}
      {cards > 0 && (
        <div className={cn('grid gap-4', `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${columns}`)}>
          {Array.from({ length: cards }).map((_, i) => (
            <SkeletonRow key={i} index={i + stats}>
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-3 w-[80%]" />
                <Skeleton className="h-3 w-[55%]" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            </SkeletonRow>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Add SettingsSkeleton and TeamSkeleton templates**

Append to `skeleton.tsx`:

```tsx
// ── Settings Skeleton ───────────────────────────────────────────────────────

interface SettingsSkeletonProps {
  showNav?: boolean
  fields?: number
}

export function SettingsSkeleton({ showNav = true, fields = 4 }: SettingsSkeletonProps) {
  return (
    <div className="flex gap-8 p-6">
      {showNav && (
        <div className="hidden md:block w-48 space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn('h-9 w-full rounded-lg', i === 0 && 'bg-primary/10')}
            />
          ))}
        </div>
      )}
      <div className="flex-1 max-w-2xl space-y-6">
        <Skeleton className="h-6 w-48" />
        {Array.from({ length: fields }).map((_, i) => (
          <SkeletonRow key={i} index={i}>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </SkeletonRow>
        ))}
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  )
}

// ── Team Skeleton ───────────────────────────────────────────────────────────

interface TeamSkeletonProps {
  rows?: number
}

export function TeamSkeleton({ rows = 6 }: TeamSkeletonProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} index={i}>
            <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0">
              <Skeleton className="h-10 w-10" circle />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </SkeletonRow>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add ChartSkeleton and CalendarSkeleton templates**

Append to `skeleton.tsx`:

```tsx
// ── Chart Skeleton ──────────────────────────────────────────────────────────

interface ChartSkeletonProps {
  height?: string
}

export function ChartSkeleton({ height = 'h-[400px]' }: ChartSkeletonProps) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end gap-4">
        {/* Y-axis ticks */}
        <div className="flex flex-col justify-between h-full py-2" style={{ minHeight: '300px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>
        {/* Chart area */}
        <div className={cn('flex-1 relative rounded-lg border border-border', height)}>
          {/* Grid lines */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-border/40"
              style={{ top: `${(i + 1) * 20}%` }}
            />
          ))}
          <Skeleton className="absolute inset-2 rounded-md opacity-30" />
        </div>
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between pl-12">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-10" />
        ))}
      </div>
    </div>
  )
}

// ── Calendar Skeleton ───────────────────────────────────────────────────────

export function CalendarSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((_, i) => (
          <Skeleton key={i} className="h-4 w-8 mx-auto" />
        ))}
      </div>
      {/* Calendar grid */}
      {Array.from({ length: 5 }).map((_, week) => (
        <SkeletonRow key={week} index={week}>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, day) => (
              <div key={day} className="h-24 rounded-lg border border-border p-2 space-y-1">
                <Skeleton className="h-3 w-4" />
                {day % 3 !== 0 && <Skeleton className="h-4 w-full rounded-full" />}
                {day % 4 === 1 && <Skeleton className="h-4 w-3/4 rounded-full" />}
              </div>
            ))}
          </div>
        </SkeletonRow>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Add ListSkeleton template**

Append to `skeleton.tsx`:

```tsx
// ── List Skeleton ───────────────────────────────────────────────────────────

const LIST_WIDTHS = ['80%', '65%', '90%', '70%', '85%', '60%']

interface ListSkeletonProps {
  rows?: number
}

export function ListSkeleton({ rows = 6 }: ListSkeletonProps) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} index={i}>
          <div className="flex items-start gap-3 py-4 px-2">
            <Skeleton className="h-9 w-9 flex-shrink-0" circle />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="h-4" style={{ width: LIST_WIDTHS[i % LIST_WIDTHS.length] }} />
              <Skeleton className="h-3 w-[50%]" />
            </div>
            <Skeleton className="h-3 w-16 flex-shrink-0" />
          </div>
        </SkeletonRow>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add services/web/src/components/ui/skeleton.tsx
git commit -m "feat: add 7 skeleton templates — Table, Kanban, Detail, CardGrid, Settings, Chart, List"
```

---

## Task 3: Replace loading states — Board, Backlog, Issue Detail, Project Settings

**Files:**
- Modify: `services/web/src/pages/ProjectBoardPage.tsx`
- Modify: `services/web/src/pages/ProjectBacklogPage.tsx`
- Modify: `services/web/src/pages/IssueDetailPage.tsx`
- Modify: `services/web/src/pages/ProjectSettingsPage.tsx`

For each page, the pattern is the same:
1. Add import for the skeleton template and `ContentFade`
2. Remove the `import { LoadingPage }` if no longer used
3. Convert the `if (isLoading) return <LoadingPage />` early return to an inline conditional that keeps the page header and renders the skeleton inside the content area

- [ ] **Step 1: Fix ProjectBoardPage.tsx**

Add to imports:
```tsx
import { KanbanSkeleton, ContentFade } from '@/components/ui/skeleton'
```

Find the early return (around line 396):
```tsx
if (isLoading) return <LoadingPage />
```

Remove that early return. In the JSX, find the board content area (after the PageHeader and sprint banner). Wrap the existing board content in a conditional:

```tsx
{isLoading ? (
  <KanbanSkeleton />
) : (
  <ContentFade>
    {/* existing board content */}
  </ContentFade>
)}
```

Remove `LoadingPage` from imports if no longer used.

- [ ] **Step 2: Fix ProjectBacklogPage.tsx**

Add to imports:
```tsx
import { TableSkeleton, ContentFade } from '@/components/ui/skeleton'
```

Find the early return (around line 853):
```tsx
if (sprintsLoading || issuesLoading) return <LoadingPage />
```

Remove that early return. In the JSX, after the PageHeader, wrap the sprint sections + backlog content:

```tsx
{(sprintsLoading || issuesLoading) ? (
  <div className="p-6"><TableSkeleton rows={10} /></div>
) : (
  <ContentFade>
    {/* existing backlog content */}
  </ContentFade>
)}
```

- [ ] **Step 3: Fix IssueDetailPage.tsx**

Add to imports:
```tsx
import { DetailSkeleton, ContentFade } from '@/components/ui/skeleton'
```

Find the early return (around line 398):
```tsx
if (isLoading) return <LoadingPage />
```

Replace with:
```tsx
if (isLoading) return <DetailSkeleton />
```

Wrap the existing issue detail content (the entire return after the loading check) with `<ContentFade>`.

- [ ] **Step 4: Fix ProjectSettingsPage.tsx**

Add to imports:
```tsx
import { SettingsSkeleton, ContentFade } from '@/components/ui/skeleton'
```

Find the early return (around line 119):
```tsx
if (isLoading) return <LoadingPage />
```

Replace with:
```tsx
if (isLoading) return (
  <>
    <PageHeader title={t('settings.projectSettings')} />
    <SettingsSkeleton />
  </>
)
```

Wrap the existing settings content with `<ContentFade>`.

- [ ] **Step 5: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add services/web/src/pages/ProjectBoardPage.tsx services/web/src/pages/ProjectBacklogPage.tsx services/web/src/pages/IssueDetailPage.tsx services/web/src/pages/ProjectSettingsPage.tsx
git commit -m "feat: replace LoadingPage with skeletons — Board, Backlog, IssueDetail, ProjectSettings"
```

---

## Task 4: Replace loading states — Dashboard, Projects, Issues, My Issues

**Files:**
- Modify: `services/web/src/pages/DashboardPage.tsx`
- Modify: `services/web/src/pages/ProjectsPage.tsx`
- Modify: `services/web/src/pages/ProjectIssuesPage.tsx`
- Modify: `services/web/src/pages/MyIssuesPage.tsx`

These pages already render headers/stats before the loading check (inline loading). The fix is simpler — just replace the inline `<LoadingPage />` with the appropriate skeleton.

- [ ] **Step 1: Fix DashboardPage.tsx**

Add to imports:
```tsx
import { CardGridSkeleton, TableSkeleton, ContentFade } from '@/components/ui/skeleton'
```

Find the early return (around line 318):
```tsx
if (issuesLoading && projectsLoading) return <LoadingPage />
```

Replace with:
```tsx
if (issuesLoading && projectsLoading) return (
  <>
    <PageHeader title={greeting} />
    <div className="p-6"><CardGridSkeleton stats={3} cards={6} /></div>
  </>
)
```

Find the inline project grid loading (around line 455):
```tsx
{projectsLoading ? <LoadingPage /> : <grid of ProjectCards />}
```

Replace with:
```tsx
{projectsLoading ? <CardGridSkeleton stats={0} cards={6} /> : <ContentFade><grid of ProjectCards /></ContentFade>}
```

- [ ] **Step 2: Fix ProjectsPage.tsx**

Add to imports:
```tsx
import { CardGridSkeleton, ContentFade } from '@/components/ui/skeleton'
```

Find the inline loading (around line 194 — inside the content area where project cards render):

Replace the `<LoadingPage />` with `<CardGridSkeleton stats={0} cards={6} />`.

Wrap the loaded project grid with `<ContentFade>`.

- [ ] **Step 3: Fix ProjectIssuesPage.tsx**

Add to imports:
```tsx
import { TableSkeleton, ContentFade } from '@/components/ui/skeleton'
```

Find the inline loading (around line 395):

Replace `<LoadingPage />` with `<TableSkeleton />`.

Wrap the loaded table with `<ContentFade>`.

- [ ] **Step 4: Fix MyIssuesPage.tsx**

Same pattern as ProjectIssuesPage:

Add `TableSkeleton, ContentFade` imports. Replace the inline `<LoadingPage />` (around line 152) with `<TableSkeleton />`. Wrap loaded content with `<ContentFade>`.

- [ ] **Step 5: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add services/web/src/pages/DashboardPage.tsx services/web/src/pages/ProjectsPage.tsx services/web/src/pages/ProjectIssuesPage.tsx services/web/src/pages/MyIssuesPage.tsx
git commit -m "feat: replace LoadingPage with skeletons — Dashboard, Projects, Issues, MyIssues"
```

---

## Task 5: Replace loading states — Settings pages (User, Team, Roles, Billing, Webhooks, Automations)

**Files:**
- Modify: `services/web/src/pages/UserSettingsPage.tsx`
- Modify: `services/web/src/pages/TeamPage.tsx`
- Modify: `services/web/src/pages/RoleManagementPage.tsx`
- Modify: `services/web/src/pages/BillingPage.tsx`
- Modify: `services/web/src/pages/WebhooksPage.tsx`
- Modify: `services/web/src/pages/ProjectAutomationsPage.tsx`

- [ ] **Step 1: Fix UserSettingsPage.tsx**

Add imports: `SettingsSkeleton, ContentFade` from skeleton.

Two `<LoadingPage />` usages (lines 138 and 576):
- Line 576 (outer shell): Replace `if (isLoading) return <LoadingPage />` with `if (isLoading) return <SettingsSkeleton />`
- Line 138 (ProfileTab inner): Replace with `<SettingsSkeleton showNav={false} fields={5} />`

- [ ] **Step 2: Fix TeamPage.tsx**

Add imports: `TeamSkeleton, ContentFade` from skeleton.

Replace the early return (line 403): `if (isLoading) return <LoadingPage />` with:
```tsx
if (isLoading) return (
  <>
    <PageHeader title={t('settings.team')} />
    <TeamSkeleton />
  </>
)
```

- [ ] **Step 3: Fix RoleManagementPage.tsx**

Add imports: `SettingsSkeleton, ContentFade`.

Replace early return (line 184): `if (isLoading) return <LoadingPage />` with `if (isLoading) return <SettingsSkeleton showNav={false} fields={6} />`

- [ ] **Step 4: Fix BillingPage.tsx**

Add imports: `SettingsSkeleton, ContentFade`.

Replace the custom spinner early return (lines 229-241) with `<SettingsSkeleton showNav={false} fields={3} />`

- [ ] **Step 5: Fix WebhooksPage.tsx**

Add imports: `ListSkeleton, ContentFade`.

Replace early return (line 306): `if (isLoading) return <LoadingPage />` with:
```tsx
if (isLoading) return (
  <>
    <PageHeader title="Webhooks" />
    <div className="p-6"><ListSkeleton /></div>
  </>
)
```

Also fix the inline "Loading deliveries..." text (line 99-101) with `<ListSkeleton rows={3} />`.

- [ ] **Step 6: Fix ProjectAutomationsPage.tsx**

Add imports: `ListSkeleton, ContentFade`.

Replace early return (line 110) with:
```tsx
if (isLoading) return (
  <>
    <PageHeader title={t('automations.title')} />
    <div className="p-6"><ListSkeleton /></div>
  </>
)
```

- [ ] **Step 7: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add services/web/src/pages/UserSettingsPage.tsx services/web/src/pages/TeamPage.tsx services/web/src/pages/RoleManagementPage.tsx services/web/src/pages/BillingPage.tsx services/web/src/pages/WebhooksPage.tsx services/web/src/pages/ProjectAutomationsPage.tsx
git commit -m "feat: replace LoadingPage with skeletons — UserSettings, Team, Roles, Billing, Webhooks, Automations"
```

---

## Task 6: Replace loading states — Reports, Timeline, Calendar, Releases, Timesheet

**Files:**
- Modify: `services/web/src/pages/ProjectReportsPage.tsx`
- Modify: `services/web/src/pages/ProjectTimelinePage.tsx`
- Modify: `services/web/src/pages/ProjectCalendarPage.tsx`
- Modify: `services/web/src/pages/ProjectReleasesPage.tsx`
- Modify: `services/web/src/pages/TimesheetPage.tsx`

- [ ] **Step 1: Fix ProjectReportsPage.tsx**

Add imports: `ChartSkeleton, ContentFade`.

The reports page has 9 inline `<LoadingPage />` per chart tab (lines 281-411). Each one is inside a conditional for a specific chart query. Replace every `<LoadingPage />` inside those conditionals with `<ChartSkeleton />`.

- [ ] **Step 2: Fix ProjectTimelinePage.tsx**

Add imports: `ChartSkeleton, ContentFade`.

Replace early return (line 123) with:
```tsx
if (projectLoading) return (
  <>
    <PageHeader title="Timeline" />
    <ChartSkeleton height="h-[500px]" />
  </>
)
```

- [ ] **Step 3: Fix ProjectCalendarPage.tsx**

Add imports: `CalendarSkeleton, ContentFade`.

Replace early return (line 220) with:
```tsx
if (projectLoading) return (
  <>
    <PageHeader title="Calendar" />
    <CalendarSkeleton />
  </>
)
```

- [ ] **Step 4: Fix ProjectReleasesPage.tsx**

Add imports: `CardGridSkeleton, ContentFade`.

Replace early return (line 166) with:
```tsx
if (projectLoading || versionsLoading) return (
  <>
    <PageHeader title="Releases" />
    <div className="p-6"><CardGridSkeleton stats={0} cards={4} columns={2} /></div>
  </>
)
```

- [ ] **Step 5: Fix TimesheetPage.tsx**

Add imports: `TableSkeleton, ContentFade`.

Replace both `<LoadingPage />` usages (lines 251 and 400 — inside MyTimesheetView and TeamTimesheetView sub-components) with `<TableSkeleton rows={7} showFilters={false} />`.

- [ ] **Step 6: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add services/web/src/pages/ProjectReportsPage.tsx services/web/src/pages/ProjectTimelinePage.tsx services/web/src/pages/ProjectCalendarPage.tsx services/web/src/pages/ProjectReleasesPage.tsx services/web/src/pages/TimesheetPage.tsx
git commit -m "feat: replace LoadingPage with skeletons — Reports, Timeline, Calendar, Releases, Timesheet"
```

---

## Task 7: Replace loading states — Notifications, Audit, Trash, Pages

**Files:**
- Modify: `services/web/src/pages/NotificationsPage.tsx`
- Modify: `services/web/src/pages/AuditLogPage.tsx`
- Modify: `services/web/src/pages/ProjectTrashPage.tsx`
- Modify: `services/web/src/pages/ProjectPagesPage.tsx`

- [ ] **Step 1: Fix NotificationsPage.tsx**

Add imports: `ListSkeleton, ContentFade`. Replace inline `<LoadingPage />` (line 200) with `<ListSkeleton rows={8} />`.

- [ ] **Step 2: Fix AuditLogPage.tsx**

Add imports: `TableSkeleton, ContentFade`. Replace inline `<LoadingPage />` (line 98) with `<TableSkeleton rows={10} showFilters={false} />`.

- [ ] **Step 3: Fix ProjectTrashPage.tsx**

Add imports: `TableSkeleton, ContentFade`. Replace inline loading (line 71) with `<TableSkeleton rows={6} showFilters={false} />`.

- [ ] **Step 4: Fix ProjectPagesPage.tsx**

Add imports: `ListSkeleton, ContentFade`. Replace the "Loading pages..." text (around line 116-127) with `<ListSkeleton rows={5} />`.

- [ ] **Step 5: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add services/web/src/pages/NotificationsPage.tsx services/web/src/pages/AuditLogPage.tsx services/web/src/pages/ProjectTrashPage.tsx services/web/src/pages/ProjectPagesPage.tsx
git commit -m "feat: replace LoadingPage with skeletons — Notifications, AuditLog, Trash, Pages"
```

---

## Task 8: Fix component-level spinners

**Files:**
- Modify: `services/web/src/components/projects/github-connection.tsx`
- Modify: `services/web/src/components/issues/activity-list.tsx`
- Modify: `services/web/src/components/ai/AiUsageDashboard.tsx`
- Modify: `services/web/src/components/automation/execution-log.tsx`
- Modify: `services/web/src/components/layout/org-switcher.tsx`
- Modify: `services/web/src/components/layout/search-modal.tsx`

- [ ] **Step 1: Fix github-connection.tsx**

Add import: `Skeleton` from `@/components/ui/skeleton`.

Replace the centered `<Loader2>` spinner (lines 109-114) with:
```tsx
<div className="space-y-4 p-4">
  <Skeleton className="h-10 w-full" />
  <Skeleton className="h-10 w-full" />
  <Skeleton className="h-10 w-3/4" />
</div>
```

- [ ] **Step 2: Fix activity-list.tsx**

Add import: `ListSkeleton` from `@/components/ui/skeleton`.

Replace the custom CSS spinner (lines 157-163) with `<ListSkeleton rows={4} />`.

- [ ] **Step 3: Fix AiUsageDashboard.tsx**

Add import: `Skeleton` from `@/components/ui/skeleton`.

Replace the custom spinner div (lines 18-23) with:
```tsx
<div className="grid grid-cols-2 gap-4 p-4">
  {Array.from({ length: 4 }).map((_, i) => (
    <div key={i} className="rounded-xl border border-border p-4 space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-16" />
    </div>
  ))}
</div>
```

- [ ] **Step 4: Fix execution-log.tsx**

Add import: `ListSkeleton` from `@/components/ui/skeleton`.

Replace the centered `<Spinner>` (line 26) with `<ListSkeleton rows={3} />`.

- [ ] **Step 5: Fix org-switcher.tsx**

Add import: `Skeleton` from `@/components/ui/skeleton`.

Replace the `<Loader2>` + "Loading..." text (lines 51-63) with:
```tsx
<div className="space-y-2 px-2">
  <Skeleton className="h-8 w-full rounded-md" />
  <Skeleton className="h-8 w-full rounded-md" />
</div>
```

- [ ] **Step 6: Fix search-modal.tsx**

Add import: `Skeleton` from `@/components/ui/skeleton`.

Replace the "Searching..." text (lines 184-188) with:
```tsx
<div className="space-y-2 p-3">
  <Skeleton className="h-8 w-full" />
  <Skeleton className="h-8 w-full" />
  <Skeleton className="h-8 w-3/4" />
</div>
```

- [ ] **Step 7: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add services/web/src/components/projects/github-connection.tsx services/web/src/components/issues/activity-list.tsx services/web/src/components/ai/AiUsageDashboard.tsx services/web/src/components/automation/execution-log.tsx services/web/src/components/layout/org-switcher.tsx services/web/src/components/layout/search-modal.tsx
git commit -m "feat: replace ad-hoc spinners with skeleton loaders in 6 components"
```

---

## Task 9: Dark mode polish + final verification

**Files:**
- Modify: `services/web/src/components/ui/skeleton.tsx` (tweak shimmer for dark mode)

- [ ] **Step 1: Add dark mode shimmer variant**

In the `Skeleton` component, update the shimmer gradient to use CSS custom properties that respect the theme:

```tsx
style={{
  background:
    'linear-gradient(90deg, transparent 0%, var(--shimmer-highlight, rgba(255,255,255,0.4)) 50%, transparent 100%)',
  animation: 'shimmer 1.5s ease-in-out infinite',
}}
```

Add to `index.css` inside the `:root` block:
```css
--shimmer-highlight: rgba(255, 255, 255, 0.5);
```

Inside the `.dark` block:
```css
--shimmer-highlight: rgba(255, 255, 255, 0.06);
```

- [ ] **Step 2: Verify build compiles**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add services/web/src/components/ui/skeleton.tsx services/web/src/index.css
git commit -m "fix: dark mode shimmer polish for skeleton loaders"
```

---

## Task 10: Build, deploy, push

- [ ] **Step 1: Final type check**

Run: `cd services/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Build Docker image**

```bash
cd services/web && docker build --build-arg VITE_POSTHOG_KEY=phc_Nn2GYJdwXB6W7Us0yushtLOvvJ8373wq1jK1XMDjidt --build-arg VITE_POSTHOG_HOST=https://us.i.posthog.com -t ghcr.io/codeupscale/boardupscale-web:skeleton . 
```

- [ ] **Step 3: Deploy**

```bash
cd /home/ubuntu/infra && BU_IMAGE_TAG=skeleton docker compose up -d --no-deps --force-recreate bu-web
```

Verify health: `docker inspect --format='{{.Name}} {{.State.Health.Status}}' infra-bu-web-1`

- [ ] **Step 4: Push to remote**

```bash
git push origin fix/rbac-permissions-audit
```

- [ ] **Step 5: Verify production**

```bash
curl -s -o /dev/null -w "%{http_code}" https://app.boardupscale.com
```
Expected: 200
