# UI/UX Overhaul — Design Spec
**Date:** 2026-04-13  
**Scope:** Board, Backlog, Issues, Calendar, Timeline, Pages, Reports, Settings  
**Approach:** Full Design System Unification (Approach B)

---

## Problem Statement

A thorough audit of all 8 project pages revealed the following systemic issues:

1. **No shared project tab nav** — Board, Calendar, and Timeline each copy-paste their own tab list independently, with different sets of tabs (Calendar missing Timeline/Pages/Reports; Issues having no tabs at all).
2. **Pages and Reports pages have no PageHeader** — no breadcrumbs, no project name, no navigation context.
3. **Raw HTML elements break the theme** — `<select>` and `<input type="date">` are used in Calendar, Timeline, Reports, and Settings instead of the styled `Select` and `Input` components.
4. **Inconsistent content padding** — Board uses `p-4`, Issues uses `p-6 lg:p-8`, Reports uses `p-6`, Pages has zero padding.
5. **Reports page has 9 horizontal tabs that overflow** — not scalable.
6. **Pages page uses `confirm()`** — browser native dialog instead of `ConfirmDialog` component.
7. **Issues page has no project tab navigation** — user loses project context on this page.
8. **Two separate Export buttons on Issues page** waste header space.

---

## Decisions Made

| Question | Decision | Rationale |
|---|---|---|
| Primary nav pattern | In-page tab bar (shared component) | Industry standard for PM tools (Jira, GitHub). Sidebar handles global nav; tab bar handles project view switching. |
| Reports layout | Left sidebar + chart panel | 9 report types overflow horizontal tabs. Left sidebar (Linear/VS Code pattern) is scannable and scales to more reports. |
| Date inputs | Radix UI popover DatePicker | Native `<input type="date">` is inconsistent across browsers. Radix Popover matches existing shadcn/ui patterns. |
| Content padding | `p-6` comfortable | Balanced density for a Jira-replacement audience. Standardizes what is already the most common padding in the codebase. |

---

## New Shared Components

### `ProjectTabNav`
**Location:** `services/web/src/components/layout/project-tab-nav.tsx`

A single shared tab navigation component used by all 8 project pages. Eliminates all copy-pasted inline tab arrays.

```typescript
interface ProjectTabNavProps {
  projectKey: string
}
```

**Tabs (always 8, always in this order):**
Board · Backlog · Issues · Calendar · Timeline · Pages · Reports · Settings

**Styling:**
- Container: `flex gap-1 px-6 pt-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900`
- Active tab: `border-b-2 border-blue-600 text-blue-600 text-sm font-medium`
- Inactive tab: `border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
- Active state determined by `useLocation().pathname` match

**Placement:** Directly below `<PageHeader>` on every project page.

---

### `DatePicker`
**Location:** `services/web/src/components/ui/date-picker.tsx`

A calendar popover date picker built with Radix UI Popover, matching the existing Input component's visual style exactly.

```typescript
interface DatePickerProps {
  value?: string          // ISO date string "YYYY-MM-DD"
  onChange: (date: string | undefined) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
}
```

**Visual behaviour:**
- Trigger: same border/radius/height/focus-ring as `Input` component
- Trigger text: formatted date ("Apr 13, 2026") or muted placeholder
- Popover: month grid with prev/next navigation buttons
- Today: blue ring highlight
- Selected date: filled blue background, white text
- Clear: clicking selected date again clears it

**Replaces all raw `<input type="date">` in:**
- Reports: CFD start/end, cycle time start/end, created-vs-resolved start/end
- Any future usage (issue due date, sprint dates)

---

## Page-by-Page Changes

### Board (`ProjectBoardPage`)
- Remove inline tab array (lines 431–456), replace with `<ProjectTabNav projectKey={projectKey} />`
- Replace raw `<select>` in Complete Sprint dialog (line 799) with styled `Select` component
- No layout changes — board density is correct as-is

### Backlog (`ProjectBacklogPage`)
- Remove inline tab array, replace with `<ProjectTabNav projectKey={projectKey} />`
- Sprint section header rows: add `bg-gray-50 dark:bg-gray-800/50` background strip for visual separation
- Sprint meta (dates, issue count) displayed inline next to sprint name in `text-sm text-gray-500`

### Issues (`ProjectIssuesPage`)
- Add `<ProjectTabNav projectKey={projectKey} />` below `<PageHeader>` (currently missing entirely)
- Merge "Export CSV" + "Export JSON" buttons into a single `DropdownMenu` with `Download` icon trigger
- Content wrapper `p-6 lg:p-8 max-w-[1400px]` stays — already correct

### Calendar (`ProjectCalendarPage`)
- Remove inline tab array (lines 204–212), replace with `<ProjectTabNav projectKey={projectKey} />`
- Replace raw `<select>` priority filter (line 300–314) with styled `Select` component
- Add "Create Issue" `<Button size="sm">` to the toolbar (opens existing `IssueForm` dialog)

### Timeline (`ProjectTimelinePage`)
- Remove inline tab array (lines 118–127), replace with `<ProjectTabNav projectKey={projectKey} />`
- Replace raw `<select>` type filter (lines 196–206) with styled `Select` component
- Increase `LABEL_W` constant from `240` to `260`

### Pages (`ProjectPagesPage`)
- Add `<PageHeader>` with:
  - `title`: project name
  - `breadcrumbs`: `[{ label: 'Projects', href: '/projects' }, { label: project.name, href: ... }, { label: 'Pages' }]`
  - `actions`: "New Page" `<Button size="sm">` (replaces sidebar `+` icon)
- Add `<ProjectTabNav projectKey={key} />` below the header
- Replace `confirm()` delete with `<ConfirmDialog>` component (wired to existing `deletePage` mutation)
- Main area background: change from `bg-gray-50` to `bg-white dark:bg-gray-900`
- Sidebar stays `w-60`

### Reports (`ProjectReportsPage`) — Redesign
**Remove:** `<Tabs>` / `<TabContent>` horizontal tab pattern entirely.

**New layout structure:**
```
<div className="flex flex-col h-full">
  <PageHeader title={project.name} breadcrumbs={...} />
  <ProjectTabNav projectKey={projectKey} />

  <div className="flex flex-1 overflow-hidden">
    {/* Left sidebar — report list */}
    <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 pt-4 pb-2">
        Reports
      </p>
      {REPORT_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => setActiveReport(item.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
            activeReport === item.id
              ? 'bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70'
          )}
        >
          <item.icon className="h-4 w-4 flex-shrink-0" />
          {item.label}
        </button>
      ))}
    </div>

    {/* Right panel — chart */}
    <div className="flex-1 overflow-auto p-6">
      {/* Controls row (sprint selector / date range) */}
      <div className="flex items-center gap-4 mb-6">
        {/* DatePicker / Select controls for active report */}
      </div>
      {/* Chart component */}
    </div>
  </div>
</div>
```

**Report sidebar items (icon + label):**
| ID | Icon | Label |
|---|---|---|
| burndown | TrendingDown | Burndown |
| burnup | TrendingUp | Burnup |
| velocity | Zap | Velocity |
| created-vs-resolved | BarChart3 | Created vs Resolved |
| cumulative-flow | Layers | Cumulative Flow |
| breakdown | PieChart | Breakdown |
| workload | Users | Workload |
| cycle-time | Timer | Cycle Time |
| sprint-report | FileText | Sprint Report |

**Controls row** (per active report):
- Burndown / Burnup / Sprint Report: `Select` for sprint picker
- Cumulative Flow / Cycle Time / Created vs Resolved: two `DatePicker` components (start + end) + optional `Select` for interval
- Velocity / Breakdown / Workload: no controls needed

All raw `<select>` and `<input type="date">` replaced with `Select` and `DatePicker`.

### Settings (`ProjectSettingsPage`)
- Replace raw `<select>` in `MemberRoleList` component (line 497) with styled `Select` component
- Tab row: add `overflow-x-auto` to the tab container to handle 11 tabs on smaller screens without clipping

---

## Padding / Spacing Standard

| Context | Value |
|---|---|
| Page content wrapper | `p-6` |
| Page content wrapper (wide screens) | `p-6 lg:p-8` (Issues page only, retains its max-width container) |
| Board (canvas area) | `p-4` — intentionally denser for kanban columns |
| PageHeader | `px-6 py-4` — unchanged |
| ProjectTabNav | `px-6 pt-3` — unchanged |
| Report sidebar items | `px-4 py-2` |
| Settings content | `p-6` |

---

## Files to Create
- `services/web/src/components/layout/project-tab-nav.tsx` (new)
- `services/web/src/components/ui/date-picker.tsx` (new)

## Files to Modify
- `services/web/src/pages/ProjectBoardPage.tsx`
- `services/web/src/pages/ProjectBacklogPage.tsx`
- `services/web/src/pages/ProjectIssuesPage.tsx`
- `services/web/src/pages/ProjectCalendarPage.tsx`
- `services/web/src/pages/ProjectTimelinePage.tsx`
- `services/web/src/pages/ProjectPagesPage.tsx`
- `services/web/src/pages/ProjectReportsPage.tsx`
- `services/web/src/pages/ProjectSettingsPage.tsx`

## Files Unchanged
- All backend/API files
- `services/web/src/components/common/page-header.tsx`
- All chart components under `services/web/src/components/reports/`
- All board components under `services/web/src/components/board/`
- Sidebar, topbar, AppLayout

---

## Success Criteria
- All 8 project pages show the same 8-tab `ProjectTabNav` in the same position
- Pages and Reports pages have `PageHeader` with breadcrumbs
- Zero raw `<select>` or `<input type="date">` elements in any project page
- All pages use `p-6` content padding (except Board canvas which stays `p-4`)
- Reports page shows left sidebar + chart panel layout
- `DatePicker` component passes consistent visual styling across Chrome, Firefox, Safari
- Pages delete uses `ConfirmDialog` instead of `confirm()`
- TypeScript strict mode — zero `any` in new components
