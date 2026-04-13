# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the UI/UX across all 8 project pages — consistent tab navigation, PageHeader on every page, styled components everywhere, and a redesigned Reports page with a left-sidebar layout.

**Architecture:** Build two new shared components (`ProjectTabNav`, `DatePicker`) first, then update each page to use them. All changes are frontend-only in `services/web/src/`. No backend changes. No new npm packages needed — `date-fns` is already installed for the DatePicker.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, date-fns, lucide-react, react-router-dom. Custom UI primitives (no Radix UI). Verification via `npx tsc --noEmit` (no test framework installed).

---

## File Map

### New Files
- `services/web/src/components/layout/project-tab-nav.tsx` — shared 8-tab project navigation
- `services/web/src/components/ui/date-picker.tsx` — calendar popover date picker

### Modified Files
- `services/web/src/pages/ProjectBoardPage.tsx` — remove inline tabs, fix Complete Sprint select
- `services/web/src/pages/ProjectBacklogPage.tsx` — remove inline tabs, improve sprint headers
- `services/web/src/pages/ProjectIssuesPage.tsx` — add ProjectTabNav, merge export dropdown
- `services/web/src/pages/ProjectCalendarPage.tsx` — remove inline tabs, fix select, add Create Issue
- `services/web/src/pages/ProjectTimelinePage.tsx` — remove inline tabs, fix select
- `services/web/src/pages/ProjectPagesPage.tsx` — add PageHeader + ProjectTabNav + ConfirmDialog
- `services/web/src/pages/ProjectReportsPage.tsx` — full left-sidebar redesign
- `services/web/src/pages/ProjectSettingsPage.tsx` — fix MemberRoleList select, fix tab overflow

---

## Task 1: Build `ProjectTabNav` Component

**Files:**
- Create: `services/web/src/components/layout/project-tab-nav.tsx`

- [ ] **Step 1: Create the component**

```tsx
// services/web/src/components/layout/project-tab-nav.tsx
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Board',     path: 'board' },
  { label: 'Backlog',   path: 'backlog' },
  { label: 'Issues',    path: 'issues' },
  { label: 'Calendar',  path: 'calendar' },
  { label: 'Timeline',  path: 'timeline' },
  { label: 'Pages',     path: 'pages' },
  { label: 'Reports',   path: 'reports' },
  { label: 'Settings',  path: 'settings' },
] as const

interface ProjectTabNavProps {
  projectKey: string
}

export function ProjectTabNav({ projectKey }: ProjectTabNavProps) {
  const location = useLocation()

  return (
    <div className="flex gap-1 px-6 pt-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0 overflow-x-auto">
      {TABS.map((tab) => {
        const href = `/projects/${projectKey}/${tab.path}`
        const isActive = location.pathname === href
        return (
          <Link
            key={tab.path}
            to={href}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0',
              isActive
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors related to `project-tab-nav.tsx`.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/components/layout/project-tab-nav.tsx
git commit -m "feat: add shared ProjectTabNav component for all project pages"
```

---

## Task 2: Build `DatePicker` Component

**Files:**
- Create: `services/web/src/components/ui/date-picker.tsx`

- [ ] **Step 1: Create the component**

```tsx
// services/web/src/components/ui/date-picker.tsx
import { useState, useRef, useEffect } from 'react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isToday,
  isSameDay,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface DatePickerProps {
  value?: string
  onChange: (date: string | undefined) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  label,
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() =>
    value ? parseISO(value) : new Date(),
  )
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parseISO(value) : undefined

  // Sync view month when value changes externally
  useEffect(() => {
    if (value) setViewDate(parseISO(value))
  }, [value])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const firstDayOffset = getDay(monthStart)

  const handleSelectDay = (day: Date) => {
    const iso = format(day, 'yyyy-MM-dd')
    if (selectedDate && isSameDay(day, selectedDate)) {
      onChange(undefined)
    } else {
      onChange(iso)
    }
    setOpen(false)
  }

  const inputId = label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {label}
        </label>
      )}
      <button
        id={inputId}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:text-gray-500 disabled:cursor-not-allowed',
          !value && 'text-gray-400 dark:text-gray-500',
          value && 'text-gray-900 dark:text-gray-100',
        )}
      >
        <CalendarDays className="h-4 w-4 flex-shrink-0 text-gray-400" />
        <span className="flex-1 truncate">
          {selectedDate ? format(selectedDate, 'MMM d, yyyy') : placeholder}
        </span>
        {value && (
          <span
            role="button"
            aria-label="Clear date"
            onClick={(e) => { e.stopPropagation(); onChange(undefined) }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg dark:shadow-2xl dark:shadow-black/40 p-3 w-64">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {days.map((day) => {
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
              const isTodayDay = isToday(day)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    'h-8 w-8 mx-auto flex items-center justify-center rounded-full text-sm transition-colors',
                    isSelected && 'bg-blue-600 text-white font-semibold',
                    !isSelected && isTodayDay && 'ring-2 ring-blue-500 text-blue-600 dark:text-blue-400 font-semibold',
                    !isSelected && !isTodayDay && 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors related to `date-picker.tsx`.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/components/ui/date-picker.tsx
git commit -m "feat: add DatePicker component with calendar popover"
```

---

## Task 3: Update Board Page

**Files:**
- Modify: `services/web/src/pages/ProjectBoardPage.tsx`

- [ ] **Step 1: Add ProjectTabNav import and remove inline tab block**

At the top of the file, add the import:
```tsx
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
```

Remove lines 430–457 (the entire `{/* Navigation Tabs */}` block):
```tsx
// DELETE this entire block:
{/* Navigation Tabs */}
<div className="flex gap-1 px-6 pt-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
  {[
    { label: t('nav.board'), href: `/projects/${projectKey}/board` },
    ...
  ].map((tab) => { ... })}
</div>
```

Replace with:
```tsx
<ProjectTabNav projectKey={projectKey!} />
```

- [ ] **Step 2: Fix raw `<select>` in Complete Sprint dialog**

In the Complete Sprint dialog (around line 798), replace:
```tsx
<select
  value={boardMoveToSprintId}
  onChange={(e) => setBoardMoveToSprintId(e.target.value)}
  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
>
  <option value="">Backlog</option>
  {otherSprints.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}{s.status === 'active' ? ' (active)' : ''}
    </option>
  ))}
</select>
```

With:
```tsx
<Select
  options={[
    { value: '', label: 'Backlog' },
    ...otherSprints.map((s) => ({
      value: s.id,
      label: `${s.name}${s.status === 'active' ? ' (active)' : ''}`,
    })),
  ]}
  value={boardMoveToSprintId}
  onChange={(e) => setBoardMoveToSprintId(e.target.value)}
/>
```

Add `Select` to the import from `@/components/ui/select` (it's already imported on line 24).

- [ ] **Step 3: Remove unused Link import if no longer needed**

Check that `Link` is still used elsewhere in the file (it's not after removing the tab block). Remove `Link` from the `react-router-dom` import line if it's not used anywhere else in the file.

- [ ] **Step 4: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add services/web/src/pages/ProjectBoardPage.tsx
git commit -m "fix: replace inline tab nav with ProjectTabNav in Board page"
```

---

## Task 4: Update Backlog Page

**Files:**
- Modify: `services/web/src/pages/ProjectBacklogPage.tsx`

- [ ] **Step 1: Add ProjectTabNav import**

```tsx
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
```

- [ ] **Step 2: Find and remove the inline tab navigation block**

Search for `flex gap-1 px-6 pt-3 border-b` in the file. Remove the entire tab nav `<div>` block (the one containing the array of Board/Backlog/Issues/... links).

Replace it with:
```tsx
<ProjectTabNav projectKey={projectKey!} />
```

- [ ] **Step 3: Improve sprint section header styling**

Find the sprint section header row. It will look something like a row with the sprint name, start button, etc. Add a background strip and better visual weight. Find the sprint header `<div>` and update its className to include:

```tsx
className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800"
```

The sprint name text element should use:
```tsx
className="font-semibold text-sm text-gray-800 dark:text-gray-200"
```

Sprint meta (dates, issue count) displayed inline — find the span/div showing issue count and ensure it renders next to the sprint name with:
```tsx
className="text-xs text-gray-500 dark:text-gray-400 ml-2"
```

- [ ] **Step 4: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add services/web/src/pages/ProjectBacklogPage.tsx
git commit -m "fix: add ProjectTabNav and improve sprint header styling in Backlog page"
```

---

## Task 5: Update Issues Page

**Files:**
- Modify: `services/web/src/pages/ProjectIssuesPage.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { DropdownMenu, DropdownItem } from '@/components/ui/dropdown-menu'
```

- [ ] **Step 2: Add ProjectTabNav below PageHeader**

In the JSX return, find `<PageHeader ... />` and add `<ProjectTabNav>` immediately after it:

```tsx
<PageHeader
  title={t('nav.issues')}
  breadcrumbs={[
    { label: t('nav.projects'), href: '/projects' },
    { label: project?.name || '...', href: `/projects/${projectKey}/board` },
    { label: t('nav.issues') },
  ]}
  actions={
    <div className="flex gap-2">
      <DropdownMenu
        trigger={
          <Button size="sm" variant="outline" disabled={exporting}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        }
      >
        <DropdownItem
          icon={<Download className="h-4 w-4" />}
          onClick={() => handleExport('csv')}
        >
          Export CSV
        </DropdownItem>
        <DropdownItem
          icon={<Download className="h-4 w-4" />}
          onClick={() => handleExport('json')}
        >
          Export JSON
        </DropdownItem>
      </DropdownMenu>
      <Button size="sm" onClick={() => setShowCreate(true)}>
        <Plus className="h-4 w-4" />
        {t('issues.createIssue')}
      </Button>
    </div>
  }
/>
<ProjectTabNav projectKey={projectKey!} />
```

- [ ] **Step 3: Remove the two separate Export buttons from the old actions**

The old `actions` prop had three buttons (Export CSV, Export JSON, Create Issue). The new `actions` has just two (merged Export dropdown + Create Issue). Ensure the old individual export buttons are fully removed.

- [ ] **Step 4: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add services/web/src/pages/ProjectIssuesPage.tsx
git commit -m "fix: add ProjectTabNav and merge export buttons in Issues page"
```

---

## Task 6: Update Calendar Page

**Files:**
- Modify: `services/web/src/pages/ProjectCalendarPage.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { Select } from '@/components/ui/select'
import { useState, useRef } from 'react'  // useRef may already be imported
```

Also add `Dialog, DialogHeader, DialogTitle, DialogContent` and `IssueForm, IssueFormHandle` imports for the Create Issue dialog (check if they're already present — they are not currently in this file):

```tsx
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { IssueForm, IssueFormHandle } from '@/components/issues/issue-form'
import { useCreateIssue } from '@/hooks/useIssues'
import { useBoard } from '@/hooks/useBoard'
import { useUsers } from '@/hooks/useUsers'
```

- [ ] **Step 2: Add state for Create Issue dialog**

Inside the component, add:
```tsx
const [showCreate, setShowCreate] = useState(false)
const issueFormRef = useRef<IssueFormHandle>(null)
const createIssue = useCreateIssue()
const { data: board } = useBoard(projectKey!)
const { data: usersResult } = useUsers()
const orgUsers = usersResult?.data
```

- [ ] **Step 3: Remove the inline tabs array and replace with ProjectTabNav**

Remove the `const tabs = [...]` array (lines 204–212) and the `<div>` block that renders it.

Replace with:
```tsx
<ProjectTabNav projectKey={projectKey!} />
```

- [ ] **Step 4: Replace raw `<select>` priority filter with styled Select**

Find the raw `<select>` for priority (in the toolbar, around line 300). Replace:
```tsx
<select
  value={priorityFilter}
  onChange={(e) => {
    setPriorityFilter(e.target.value as PriorityFilter)
    setSelectedDay(null)
  }}
  className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
>
  {PRIORITY_OPTIONS.map((p) => (
    <option key={p} value={p}>
      {p === 'all' ? 'All priorities' : p.charAt(0).toUpperCase() + p.slice(1)}
    </option>
  ))}
</select>
```

With:
```tsx
<Select
  options={PRIORITY_OPTIONS.map((p) => ({
    value: p,
    label: p === 'all' ? 'All priorities' : p.charAt(0).toUpperCase() + p.slice(1),
  }))}
  value={priorityFilter}
  onChange={(e) => {
    setPriorityFilter(e.target.value as PriorityFilter)
    setSelectedDay(null)
  }}
  className="w-40"
/>
```

- [ ] **Step 5: Add Create Issue button to toolbar and dialog**

In the toolbar `<div>` that has the month navigation, add a Create Issue button in the `ml-auto` section:
```tsx
<div className="ml-auto flex items-center gap-2">
  <span className="text-sm text-gray-500 dark:text-gray-400">Priority:</span>
  <Select ... />
  <Button size="sm" onClick={() => setShowCreate(true)}>
    <Plus className="h-4 w-4" />
    Create Issue
  </Button>
</div>
```

Add `Plus` to the lucide-react imports if not already there.

Add the Create Issue dialog at the bottom of the JSX (before the closing `</div>`):
```tsx
<Dialog open={showCreate} onClose={() => issueFormRef.current?.requestClose()} className="max-w-2xl">
  <DialogHeader onClose={() => issueFormRef.current?.requestClose()}>
    <DialogTitle>Create Issue</DialogTitle>
  </DialogHeader>
  <DialogContent>
    <IssueForm
      ref={issueFormRef}
      projectId={project?.id || projectKey!}
      statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
      users={orgUsers || []}
      onSubmit={(values) =>
        createIssue.mutate(
          { ...values, projectId: project?.id || projectKey! } as any,
          { onSuccess: () => setShowCreate(false) },
        )
      }
      onCancel={() => setShowCreate(false)}
      isLoading={createIssue.isPending}
    />
  </DialogContent>
</Dialog>
```

- [ ] **Step 6: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add services/web/src/pages/ProjectCalendarPage.tsx
git commit -m "fix: add ProjectTabNav, styled Select, and Create Issue to Calendar page"
```

---

## Task 7: Update Timeline Page

**Files:**
- Modify: `services/web/src/pages/ProjectTimelinePage.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { Select } from '@/components/ui/select'
```

- [ ] **Step 2: Increase LABEL_W constant**

Find line:
```tsx
const LABEL_W = 240
```

Change to:
```tsx
const LABEL_W = 260
```

- [ ] **Step 3: Remove inline tabs array and replace with ProjectTabNav**

Remove the `const tabs = [...]` array (lines 118–127) and the entire `<div>` block that maps over it.

Replace with:
```tsx
<ProjectTabNav projectKey={projectKey!} />
```

- [ ] **Step 4: Replace raw `<select>` type filter with styled Select**

Find the raw `<select>` for type filter (in the toolbar, around line 196). Replace:
```tsx
<select
  value={typeFilter}
  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
  className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
>
  {TYPE_OPTIONS.map((t) => (
    <option key={t} value={t}>
      {t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1)}
    </option>
  ))}
</select>
```

With:
```tsx
<Select
  options={TYPE_OPTIONS.map((t) => ({
    value: t,
    label: t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1),
  }))}
  value={typeFilter}
  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
  className="w-36"
/>
```

- [ ] **Step 5: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add services/web/src/pages/ProjectTimelinePage.tsx
git commit -m "fix: add ProjectTabNav and styled Select to Timeline page"
```

---

## Task 8: Update Pages Page

**Files:**
- Modify: `services/web/src/pages/ProjectPagesPage.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
```

- [ ] **Step 2: Add confirm dialog state**

Inside the component, add state for the delete confirmation:
```tsx
const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
```

- [ ] **Step 3: Update handleDeletePage to use state instead of confirm()**

Replace:
```tsx
async function handleDeletePage(id: string, title: string) {
  if (!project) return
  if (!confirm(`Delete "${title}" and all its sub-pages? This cannot be undone.`)) return
  await deletePage.mutateAsync({ id, projectId: project.id })
}
```

With:
```tsx
function handleDeletePage(id: string, title: string) {
  setDeleteTarget({ id, title })
}

async function handleConfirmDelete() {
  if (!deleteTarget || !project) return
  await deletePage.mutateAsync({ id: deleteTarget.id, projectId: project.id })
  setDeleteTarget(null)
}
```

- [ ] **Step 4: Replace the JSX return with the updated layout**

```tsx
return (
  <div className="flex flex-col h-full">
    <PageHeader
      title={project?.name || 'Pages'}
      breadcrumbs={[
        { label: 'Projects', href: '/projects' },
        { label: project?.name || '...', href: `/projects/${key}/board` },
        { label: 'Pages' },
      ]}
      actions={
        <Button
          size="sm"
          onClick={() => handleCreatePage()}
          disabled={createPage.isPending || !project}
        >
          <Plus size={14} />
          New Page
        </Button>
      }
    />
    <ProjectTabNav projectKey={key!} />

    <div className="flex flex-1 min-h-0">
      {/* Sidebar — page tree */}
      <div className="w-60 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <BookOpen size={15} />
            Pages
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          <PageTree
            pages={pages}
            projectKey={key || ''}
            onCreatePage={handleCreatePage}
            onDeletePage={handleDeletePage}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Main content — empty state when no page selected */}
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-gray-900">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
          <FileText size={32} className="text-blue-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {pages.length === 0 ? 'Create your first page' : 'Select a page'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          {pages.length === 0
            ? 'Write specs, runbooks, meeting notes, and RFCs — all in one place alongside your issues.'
            : 'Click a page in the sidebar to open it, or create a new one.'}
        </p>
        <Button
          onClick={() => handleCreatePage()}
          disabled={createPage.isPending || !project}
          className="gap-2"
        >
          <Plus size={14} />
          New Page
        </Button>
      </div>
    </div>

    <ConfirmDialog
      open={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      onConfirm={handleConfirmDelete}
      title="Delete Page"
      description={
        deleteTarget
          ? `Delete "${deleteTarget.title}" and all its sub-pages? This cannot be undone.`
          : ''
      }
      confirmLabel="Delete"
      destructive
      isLoading={deletePage.isPending}
    />
  </div>
)
```

- [ ] **Step 5: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add services/web/src/pages/ProjectPagesPage.tsx
git commit -m "fix: add PageHeader, ProjectTabNav, and ConfirmDialog to Pages page"
```

---

## Task 9: Redesign Reports Page

**Files:**
- Modify: `services/web/src/pages/ProjectReportsPage.tsx`

- [ ] **Step 1: Replace the entire file content**

```tsx
import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  TrendingDown,
  TrendingUp,
  Zap,
  Layers,
  PieChart as PieChartIcon,
  Users,
  Timer,
  FileText,
  BarChart3,
} from 'lucide-react'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { useProject } from '@/hooks/useProjects'
import { useSprints } from '@/hooks/useSprints'
import {
  useSprintBurndown,
  useSprintBurnup,
  useVelocity,
  useCumulativeFlow,
  useIssueBreakdown,
  useAssigneeWorkload,
  useCycleTime,
  useSprintReport,
  useCreatedVsResolved,
} from '@/hooks/useReports'
import { BurndownChart } from '@/components/reports/burndown-chart'
import { BurnupChart } from '@/components/reports/burnup-chart'
import { VelocityChart } from '@/components/reports/velocity-chart'
import { CumulativeFlowChart } from '@/components/reports/cumulative-flow-chart'
import { IssueBreakdownCharts } from '@/components/reports/issue-breakdown-charts'
import { WorkloadChart } from '@/components/reports/workload-chart'
import { CycleTimeChart } from '@/components/reports/cycle-time-chart'
import { SprintReport } from '@/components/reports/sprint-report'
import { CreatedVsResolvedChart } from '@/components/reports/created-vs-resolved-chart'
import { cn } from '@/lib/utils'

const REPORT_ITEMS = [
  { id: 'burndown',           label: 'Burndown',            icon: TrendingDown },
  { id: 'burnup',             label: 'Burnup',              icon: TrendingUp },
  { id: 'velocity',           label: 'Velocity',            icon: Zap },
  { id: 'created-vs-resolved',label: 'Created vs Resolved', icon: BarChart3 },
  { id: 'cumulative-flow',    label: 'Cumulative Flow',     icon: Layers },
  { id: 'breakdown',          label: 'Breakdown',           icon: PieChartIcon },
  { id: 'workload',           label: 'Workload',            icon: Users },
  { id: 'cycle-time',         label: 'Cycle Time',          icon: Timer },
  { id: 'sprint-report',      label: 'Sprint Report',       icon: FileText },
] as const

type ReportId = (typeof REPORT_ITEMS)[number]['id']

export function ProjectReportsPage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const [activeReport, setActiveReport] = useState<ReportId>('burndown')
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [cfdStartDate, setCfdStartDate] = useState<string | undefined>()
  const [cfdEndDate, setCfdEndDate] = useState<string | undefined>()
  const [ctStartDate, setCtStartDate] = useState<string | undefined>()
  const [ctEndDate, setCtEndDate] = useState<string | undefined>()
  const [cvrStartDate, setCvrStartDate] = useState<string | undefined>()
  const [cvrEndDate, setCvrEndDate] = useState<string | undefined>()
  const [cvrInterval, setCvrInterval] = useState<'day' | 'week'>('day')

  const { data: project } = useProject(projectKey!)
  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectKey || '')

  const activeSprint = useMemo(() => {
    if (selectedSprintId) return selectedSprintId
    if (!sprints || sprints.length === 0) return ''
    const active = sprints.find((s) => s.status === 'active')
    return active?.id || sprints[0]?.id || ''
  }, [sprints, selectedSprintId])

  const sprintOptions = useMemo(() =>
    (sprints || []).map((s) => ({ value: s.id, label: `${s.name} (${s.status})` })),
    [sprints],
  )

  // Data hooks — only fetch when the report is active
  const burndownQuery  = useSprintBurndown(projectKey || '', activeReport === 'burndown' ? activeSprint : '')
  const burnupQuery    = useSprintBurnup(projectKey || '', activeReport === 'burnup' ? activeSprint : '')
  const velocityQuery  = useVelocity(projectKey || '', activeReport === 'velocity' ? 6 : 0)
  const cfdQuery       = useCumulativeFlow(projectKey || '', activeReport === 'cumulative-flow' ? cfdStartDate : undefined, activeReport === 'cumulative-flow' ? cfdEndDate : undefined)
  const breakdownQuery = useIssueBreakdown(activeReport === 'breakdown' ? projectKey || '' : '')
  const workloadQuery  = useAssigneeWorkload(activeReport === 'workload' ? projectKey || '' : '')
  const cycleTimeQuery = useCycleTime(activeReport === 'cycle-time' ? projectKey || '' : '', activeReport === 'cycle-time' ? ctStartDate : undefined, activeReport === 'cycle-time' ? ctEndDate : undefined)
  const cvrQuery       = useCreatedVsResolved(activeReport === 'created-vs-resolved' ? projectKey || '' : '', activeReport === 'created-vs-resolved' ? cvrStartDate : undefined, activeReport === 'created-vs-resolved' ? cvrEndDate : undefined, activeReport === 'created-vs-resolved' ? cvrInterval : undefined)
  const sprintRptQuery = useSprintReport(projectKey || '', activeReport === 'sprint-report' ? activeSprint : '')

  if (!projectKey) return null

  const sprintSelector = (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Sprint</label>
      {sprintsLoading ? (
        <span className="text-sm text-gray-500">Loading…</span>
      ) : sprintOptions.length > 0 ? (
        <Select
          options={sprintOptions}
          value={activeSprint}
          onChange={(e) => setSelectedSprintId(e.target.value)}
          className="w-64"
        />
      ) : (
        <span className="text-sm text-gray-500">No sprints available</span>
      )}
    </div>
  )

  const dateRangeControls = (
    startDate: string | undefined,
    setStart: (v: string | undefined) => void,
    endDate: string | undefined,
    setEnd: (v: string | undefined) => void,
    showInterval = false,
  ) => (
    <div className="flex items-center gap-4 flex-wrap">
      <DatePicker
        label="Start Date"
        value={startDate}
        onChange={setStart}
        placeholder="Start date"
        className="w-44"
      />
      <DatePicker
        label="End Date"
        value={endDate}
        onChange={setEnd}
        placeholder="End date"
        className="w-44"
      />
      {showInterval && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Interval</label>
          <Select
            options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }]}
            value={cvrInterval}
            onChange={(e) => setCvrInterval(e.target.value as 'day' | 'week')}
            className="w-32"
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project?.name || 'Reports'}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: 'Reports' },
        ]}
      />
      <ProjectTabNav projectKey={projectKey} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — report list */}
        <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 pt-4 pb-2">
            Reports
          </p>
          {REPORT_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveReport(id)}
              className={cn(
                'flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left',
                activeReport === id
                  ? 'bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Right panel — chart */}
        <div className="flex-1 overflow-auto p-6">
          {/* Controls row */}
          <div className="mb-6">
            {(activeReport === 'burndown' || activeReport === 'burnup' || activeReport === 'sprint-report') && sprintSelector}
            {activeReport === 'cumulative-flow' && dateRangeControls(cfdStartDate, setCfdStartDate, cfdEndDate, setCfdEndDate)}
            {activeReport === 'cycle-time' && dateRangeControls(ctStartDate, setCtStartDate, ctEndDate, setCtEndDate)}
            {activeReport === 'created-vs-resolved' && dateRangeControls(cvrStartDate, setCvrStartDate, cvrEndDate, setCvrEndDate, true)}
          </div>

          {/* Chart content */}
          {activeReport === 'burndown' && (
            !activeSprint ? <EmptyState title="No sprint selected" description="Select a sprint to view the burndown chart." />
            : burndownQuery.isLoading ? <LoadingPage />
            : burndownQuery.data ? <BurndownChart data={burndownQuery.data} />
            : <EmptyState title="No burndown data" description="Start a sprint to track burndown." />
          )}

          {activeReport === 'burnup' && (
            !activeSprint ? <EmptyState title="No sprint selected" description="Select a sprint to view the burnup chart." />
            : burnupQuery.isLoading ? <LoadingPage />
            : burnupQuery.data ? <BurnupChart data={burnupQuery.data} />
            : <EmptyState title="No burnup data" description="Start a sprint to track burnup." />
          )}

          {activeReport === 'velocity' && (
            velocityQuery.isLoading ? <LoadingPage />
            : velocityQuery.data ? <VelocityChart data={velocityQuery.data} />
            : <EmptyState title="No velocity data" description="Complete sprints to track velocity." />
          )}

          {activeReport === 'created-vs-resolved' && (
            cvrQuery.isLoading ? <LoadingPage />
            : cvrQuery.data ? <CreatedVsResolvedChart data={cvrQuery.data} />
            : <EmptyState title="No data" description="Create and resolve issues to see the chart." />
          )}

          {activeReport === 'cumulative-flow' && (
            cfdQuery.isLoading ? <LoadingPage />
            : cfdQuery.data ? <CumulativeFlowChart data={cfdQuery.data} />
            : <EmptyState title="No flow data" description="Create issues to see cumulative flow." />
          )}

          {activeReport === 'breakdown' && (
            breakdownQuery.isLoading ? <LoadingPage />
            : breakdownQuery.data ? <IssueBreakdownCharts data={breakdownQuery.data} />
            : <EmptyState title="No breakdown data" description="Create issues to see breakdowns." />
          )}

          {activeReport === 'workload' && (
            workloadQuery.isLoading ? <LoadingPage />
            : workloadQuery.data ? <WorkloadChart data={workloadQuery.data} />
            : <EmptyState title="No workload data" description="Assign issues to team members to see workload." />
          )}

          {activeReport === 'cycle-time' && (
            cycleTimeQuery.isLoading ? <LoadingPage />
            : cycleTimeQuery.data ? <CycleTimeChart data={cycleTimeQuery.data} />
            : <EmptyState title="No cycle time data" description="Complete issues to track cycle time." />
          )}

          {activeReport === 'sprint-report' && (
            !activeSprint ? <EmptyState title="No sprint selected" description="Select a sprint to view the report." />
            : sprintRptQuery.isLoading ? <LoadingPage />
            : sprintRptQuery.data ? <SprintReport data={sprintRptQuery.data} />
            : <EmptyState title="No sprint data" description="Select a sprint to view its report." />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/pages/ProjectReportsPage.tsx
git commit -m "feat: redesign Reports page with left-sidebar layout and styled components"
```

---

## Task 10: Update Settings Page

**Files:**
- Modify: `services/web/src/pages/ProjectSettingsPage.tsx`

- [ ] **Step 1: Fix MemberRoleList raw select**

In the `MemberRoleList` function component (bottom of the file, around line 497), find the raw `<select>` for role assignment:

```tsx
<select
  className="text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
  value={(member as any).roleId || ''}
  onChange={(e) => {
    if (e.target.value) {
      assignRole.mutate({
        projectId,
        memberId: member.id,
        roleId: e.target.value,
      })
    }
  }}
>
  <option value="">Assign role...</option>
  {roles.map((r) => (
    <option key={r.id} value={r.id}>
      {r.name} {r.isSystem ? '(system)' : ''}
    </option>
  ))}
</select>
```

Replace with:
```tsx
<Select
  options={[
    { value: '', label: 'Assign role...' },
    ...roles.map((r) => ({
      value: r.id,
      label: `${r.name}${r.isSystem ? ' (system)' : ''}`,
    })),
  ]}
  value={(member as any).roleId || ''}
  onChange={(e) => {
    if (e.target.value) {
      assignRole.mutate({
        projectId,
        memberId: member.id,
        roleId: e.target.value,
      })
    }
  }}
  className="w-48 text-xs"
/>
```

Ensure `Select` is imported at the top of the file — it already is (line 21).

- [ ] **Step 2: Fix tabs overflow**

Find the `<Tabs>` component call in the JSX (around line 126). The `Tabs` component renders a tab row. Open `services/web/src/components/ui/tabs.tsx` and check its container className. Wrap the `<Tabs>` in a scrollable container:

```tsx
<div className="overflow-x-auto -mx-6 px-6">
  <Tabs
    tabs={[...]}
    activeTab={activeTab}
    onChange={setActiveTab}
  />
</div>
```

- [ ] **Step 3: Type-check**

```bash
cd services/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add services/web/src/pages/ProjectSettingsPage.tsx
git commit -m "fix: replace raw select in MemberRoleList and fix tab overflow in Settings page"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full type-check**

```bash
cd services/web && npx tsc --noEmit 2>&1
```

Expected: zero errors across all modified files.

- [ ] **Step 2: Build check**

```bash
cd services/web && npm run build 2>&1 | tail -20
```

Expected: Build completes successfully with no errors.

- [ ] **Step 3: Visual verification checklist**

Start the dev server:
```bash
cd services/web && npm run dev
```

Open a project in the browser and verify each page:

| Page | Check |
|---|---|
| Board | ProjectTabNav shows 8 tabs; active tab is "Board"; Complete Sprint dialog uses styled select |
| Backlog | ProjectTabNav shows 8 tabs; active tab is "Backlog"; sprint headers have background strip |
| Issues | ProjectTabNav shows 8 tabs; active tab is "Issues"; Export button is a single dropdown |
| Calendar | ProjectTabNav shows 8 tabs; active tab is "Calendar"; priority filter is styled Select; Create Issue button visible |
| Timeline | ProjectTabNav shows 8 tabs; active tab is "Timeline"; type filter is styled Select |
| Pages | PageHeader shows project name + breadcrumbs; ProjectTabNav shows 8 tabs; delete uses modal not browser confirm |
| Reports | PageHeader + ProjectTabNav; left sidebar with 9 report types; clicking report switches chart; date controls use DatePicker |
| Settings | MemberRoleList role select is styled; 11 tabs scroll horizontally on narrow viewport |
| DatePicker | Open Reports > Cumulative Flow; click Start Date — calendar popover opens; pick a date — trigger shows formatted date; click X — clears |

- [ ] **Step 4: Final commit if any fixes were made**

```bash
git add -p
git commit -m "fix: final visual verification fixes"
```
