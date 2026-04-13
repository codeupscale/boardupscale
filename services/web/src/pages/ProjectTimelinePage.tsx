import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  format,
  addDays,
  subDays,
  differenceInDays,
  isWeekend,
  parseISO,
  startOfDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, GanttChart } from 'lucide-react'
import { useProject } from '@/hooks/useProjects'
import { useIssues } from '@/hooks/useIssues'
import { useSprints } from '@/hooks/useSprints'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

const LABEL_W = 260

const ZOOM_CFG = {
  week: { dayPx: 40, days: 28, step: 14 },
  month: { dayPx: 20, days: 56, step: 28 },
  quarter: { dayPx: 10, days: 112, step: 56 },
} as const

type Zoom = keyof typeof ZOOM_CFG

const TYPE_BAR: Record<string, string> = {
  epic: 'bg-purple-500',
  story: 'bg-blue-500',
  task: 'bg-emerald-500',
  bug: 'bg-red-500',
  subtask: 'bg-gray-400',
}

const TYPE_BADGE: Record<string, string> = {
  epic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  story: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  task: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  bug: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  subtask: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const TYPE_OPTIONS = ['all', 'epic', 'story', 'task', 'bug', 'subtask'] as const
type TypeFilter = (typeof TYPE_OPTIONS)[number]

export function ProjectTimelinePage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const navigate = useNavigate()

  const [zoom, setZoom] = useState<Zoom>('month')
  const [viewStart, setViewStart] = useState(() => subDays(startOfDay(new Date()), 7))
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const { data: project, isLoading: projectLoading } = useProject(projectKey!)
  const { data: issuesData, isLoading: issuesLoading } = useIssues(
    project ? { projectId: project.id, limit: 100 } : {},
  )
  const { data: sprints = [] } = useSprints(project?.id ?? '')

  const cfg = ZOOM_CFG[zoom]
  const viewEnd = addDays(viewStart, cfg.days - 1)
  const totalWidth = cfg.days * cfg.dayPx
  const today = startOfDay(new Date())
  const todayOffset = differenceInDays(today, viewStart)
  const todayInView = todayOffset >= 0 && todayOffset < cfg.days

  const days = useMemo(
    () => Array.from({ length: cfg.days }, (_, i) => addDays(viewStart, i)),
    [viewStart, cfg.days],
  )

  const monthSegs = useMemo(() => {
    const out: { label: string; start: number; count: number }[] = []
    let i = 0
    while (i < days.length) {
      const m = format(days[i], 'MMM yyyy')
      let j = i
      while (j < days.length && format(days[j], 'MMM yyyy') === m) j++
      out.push({ label: m, start: i, count: j - i })
      i = j
    }
    return out
  }, [days])

  const sprintBands = useMemo(
    () =>
      sprints
        .filter((s) => s.startDate && s.endDate)
        .map((s) => {
          const sStart = Math.max(0, differenceInDays(parseISO(s.startDate!), viewStart))
          const sEnd = Math.min(cfg.days, differenceInDays(parseISO(s.endDate!), viewStart) + 1)
          return { ...s, sStart, sEnd, visible: sEnd > sStart }
        })
        .filter((b) => b.visible),
    [sprints, viewStart, cfg.days],
  )

  const filteredIssues = useMemo(() => {
    const all = issuesData?.data ?? []
    return all.filter((issue) => {
      // Show if it has a due date OR is in a sprint with defined dates
      const hasDueDate = !!issue.dueDate
      const hasSprintDates = !!(issue.sprint?.startDate && issue.sprint?.endDate)
      if (!hasDueDate && !hasSprintDates) return false
      if (typeFilter !== 'all' && issue.type !== typeFilter) return false
      return true
    })
  }, [issuesData, typeFilter])

  if (projectLoading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project?.name || 'Timeline'}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: 'Timeline' },
        ]}
      />

      <ProjectTabNav projectKey={projectKey!} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={() => setViewStart((d) => subDays(d, cfg.step))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setViewStart((d) => addDays(d, cfg.step))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setViewStart(subDays(today, 7))}>
          Today
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
          {format(viewStart, 'MMM d')} – {format(viewEnd, 'MMM d, yyyy')}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Zoom toggle */}
          <div className="flex border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden text-xs">
            {(['week', 'month', 'quarter'] as Zoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={cn(
                  'px-3 py-1.5 font-medium transition-colors',
                  zoom === z
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700',
                )}
              >
                {z.charAt(0).toUpperCase() + z.slice(1)}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <Select
            options={TYPE_OPTIONS.map((t) => ({
              value: t,
              label: t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1),
            }))}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="w-36"
          />
        </div>
      </div>

      {/* Timeline body */}
      {issuesLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-gray-400">Loading…</span>
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<GanttChart className="h-8 w-8" />}
            title="No issues to show"
            description={
              typeFilter === 'all'
                ? 'Add issues to a sprint or set due dates to see them on the timeline'
                : `No ${typeFilter} issues are in a sprint or have due dates`
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
          <div style={{ minWidth: LABEL_W + totalWidth }}>
            {/* STICKY HEADER */}
            <div
              className="sticky top-0 z-20 flex"
              style={{ minWidth: LABEL_W + totalWidth }}
            >
              {/* Corner cell (sticky top + left) */}
              <div
                className="sticky left-0 z-30 bg-gray-50 dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 flex items-end px-3 pb-1"
                style={{ width: LABEL_W, flexShrink: 0, minHeight: 68 }}
              >
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Issue
                </span>
              </div>

              {/* Time header columns */}
              <div
                className="relative bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
                style={{ width: totalWidth, flexShrink: 0, minHeight: 68 }}
              >
                {/* Row 1: Month labels */}
                <div className="flex h-7 border-b border-gray-200 dark:border-gray-700">
                  {monthSegs.map((seg) => (
                    <div
                      key={seg.label}
                      className="flex items-center px-2 border-r border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800"
                      style={{ width: seg.count * cfg.dayPx, flexShrink: 0 }}
                    >
                      {seg.label}
                    </div>
                  ))}
                </div>

                {/* Row 2: Sprint bands */}
                <div className="relative h-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  {sprintBands.map((b) => (
                    <div
                      key={b.id}
                      className="absolute inset-y-0 bg-blue-100 dark:bg-blue-900/40 border-x border-blue-200 dark:border-blue-800 flex items-center px-1 overflow-hidden"
                      style={{ left: b.sStart * cfg.dayPx, width: (b.sEnd - b.sStart) * cfg.dayPx }}
                      title={b.name}
                    >
                      <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 truncate">
                        {b.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Row 3: Day numbers */}
                <div className="relative flex h-8">
                  {days.map((day, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center justify-center text-[10px] border-r border-gray-200 dark:border-gray-700 flex-shrink-0',
                        isWeekend(day)
                          ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                          : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400',
                        i === todayOffset && 'font-bold text-blue-600 dark:text-blue-400',
                      )}
                      style={{ width: cfg.dayPx }}
                    >
                      {cfg.dayPx >= 20
                        ? format(day, 'd')
                        : i % 7 === 0
                          ? format(day, 'd')
                          : ''}
                    </div>
                  ))}

                  {/* Today marker in day row */}
                  {todayInView && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-blue-500 dark:bg-blue-400 pointer-events-none"
                      style={{ left: todayOffset * cfg.dayPx + cfg.dayPx / 2 }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* BODY ROWS */}
            {filteredIssues.map((issue) => {
              // Use due date range if set; otherwise fall back to sprint date range
              const usingSprintDates = !issue.dueDate && !!(issue.sprint?.startDate && issue.sprint?.endDate)
              const barStart = usingSprintDates
                ? startOfDay(parseISO(issue.sprint!.startDate!))
                : startOfDay(parseISO(issue.createdAt))
              const barEnd = usingSprintDates
                ? startOfDay(parseISO(issue.sprint!.endDate!))
                : startOfDay(parseISO(issue.dueDate!))
              const effectiveEnd = barEnd >= barStart ? barEnd : barStart

              const rawStart = differenceInDays(barStart, viewStart)
              const rawEnd = differenceInDays(effectiveEnd, viewStart) + 1
              const clampedStart = Math.max(0, rawStart)
              const clampedEnd = Math.min(cfg.days, rawEnd)

              const barLeft = clampedStart * cfg.dayPx
              const barWidth = Math.max(cfg.dayPx, (clampedEnd - clampedStart) * cfg.dayPx)
              const barInView = clampedEnd > 0 && clampedStart < cfg.days

              const type = issue.type as string
              const barColor = TYPE_BAR[type] ?? TYPE_BAR.task
              const badgeClass = TYPE_BADGE[type] ?? TYPE_BADGE.task

              return (
                <div
                  key={issue.id}
                  className="flex border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/30 dark:hover:bg-blue-900/10"
                  style={{ minWidth: LABEL_W + totalWidth, height: 44 }}
                >
                  {/* Label (sticky left) */}
                  <div
                    className="sticky left-0 z-10 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex items-center gap-2 px-3"
                    style={{ width: LABEL_W, flexShrink: 0 }}
                  >
                    <span className={cn('text-[10px] font-bold px-1 rounded flex-shrink-0', badgeClass)}>
                      {issue.key}
                    </span>
                    <button
                      onClick={() => navigate(`/projects/${projectKey}/issues/${issue.key}`)}
                      className="text-xs text-gray-700 dark:text-gray-300 truncate hover:text-blue-600 dark:hover:text-blue-400 text-left min-w-0"
                      title={issue.title}
                    >
                      {issue.title}
                    </button>
                  </div>

                  {/* Gantt bar area */}
                  <div className="relative" style={{ width: totalWidth, flexShrink: 0, height: 44 }}>
                    {/* Today line (faint in body rows) */}
                    {todayInView && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-blue-400/30 dark:bg-blue-500/30 pointer-events-none z-10"
                        style={{ left: todayOffset * cfg.dayPx + cfg.dayPx / 2 }}
                      />
                    )}

                    {/* Issue bar */}
                    {barInView && (
                      <div
                        className={cn(
                          'absolute top-2.5 h-5 rounded cursor-pointer transition-opacity hover:opacity-80 flex items-center overflow-hidden',
                          usingSprintDates ? 'opacity-60 border border-dashed border-white/50' : '',
                          barColor,
                        )}
                        style={{ left: barLeft, width: barWidth }}
                        title={`${issue.key}: ${issue.title}\n${format(barStart, 'MMM d')} → ${format(effectiveEnd, 'MMM d, yyyy')}${usingSprintDates ? ' (sprint dates)' : ''}`}
                        onClick={() => navigate(`/projects/${projectKey}/issues/${issue.key}`)}
                      >
                        {barWidth >= 50 && (
                          <span className="text-white text-[10px] font-medium px-1.5 truncate">
                            {issue.key}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
