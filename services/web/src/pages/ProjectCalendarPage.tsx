import { useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isToday,
  isSameDay,
  parseISO,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Minus,
  CalendarDays,
  Plus,
} from 'lucide-react'
import { useProject } from '@/hooks/useProjects'
import { useIssues, useCreateIssue } from '@/hooks/useIssues'
import { useBoard } from '@/hooks/useBoard'
import { useUsers } from '@/hooks/useUsers'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IssueForm, IssueFormHandle } from '@/components/issues/issue-form'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { cn } from '@/lib/utils'
import { Issue } from '@/types'

// ─── Heatmap colour scale ──────────────────────────────────────────────────
type HeatLevel = 0 | 1 | 2 | 3 | 4

function heatLevel(count: number): HeatLevel {
  if (count === 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

const HEAT_BG: Record<HeatLevel, string> = {
  0: '',
  1: 'bg-blue-100 dark:bg-blue-900/40',
  2: 'bg-blue-300 dark:bg-blue-700',
  3: 'bg-blue-500 dark:bg-blue-600',
  4: 'bg-blue-700 dark:bg-blue-500',
}

const HEAT_TEXT: Record<HeatLevel, string> = {
  0: 'text-muted-foreground',
  1: 'text-blue-700 dark:text-blue-300',
  2: 'text-blue-900 dark:text-white',
  3: 'text-white',
  4: 'text-white',
}

// ─── Priority helpers ──────────────────────────────────────────────────────
const PRIORITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />,
  high: <ArrowUp className="h-3.5 w-3.5 text-orange-500 shrink-0" />,
  medium: <ArrowRight className="h-3.5 w-3.5 text-blue-500 shrink-0" />,
  low: <ArrowDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />,
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3

const PRIORITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low'] as const
type PriorityFilter = (typeof PRIORITY_OPTIONS)[number]

// ─── Priority chip colours ─────────────────────────────────────────────────
const CHIP_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  medium:   'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  low:      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

function IssueChip({ issue, projectKey }: { issue: Issue; projectKey: string }) {
  const navigate = useNavigate()
  return (
    <button
      title={issue.title}
      onClick={(e) => { e.stopPropagation(); navigate(`/projects/${projectKey}/issues/${issue.key}`) }}
      className={cn(
        'w-full text-left px-1.5 py-0.5 rounded text-xs truncate font-medium transition-opacity hover:opacity-75',
        CHIP_COLOR[issue.priority] ?? CHIP_COLOR.low,
      )}
    >
      <span className="opacity-60 mr-1">{issue.key}</span>
      {issue.title}
    </button>
  )
}

// ─── Issue side-panel card ─────────────────────────────────────────────────
function IssuePanelCard({ issue, projectKey }: { issue: Issue; projectKey: string }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/projects/${projectKey}/issues/${issue.key}`)}
      className="w-full text-left p-3 rounded-lg border border-border bg-card hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5">{PRIORITY_ICON[issue.priority] ?? <Minus className="h-3.5 w-3.5 text-gray-400 shrink-0" />}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground mb-0.5">{issue.key}</p>
          <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {issue.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {issue.status && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-foreground font-medium">
                {issue.status.name}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground capitalize">
              {PRIORITY_LABEL[issue.priority] ?? issue.priority}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
export function ProjectCalendarPage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const issueFormRef = useRef<IssueFormHandle>(null)
  const createIssue = useCreateIssue()
  const { data: board } = useBoard(projectKey!)
  const { data: usersResult } = useUsers()
  const orgUsers = usersResult?.data

  const { data: project, isLoading: projectLoading } = useProject(projectKey!)

  // Fetch issues — limit capped at 100 (API max was raised to 500, but 100 covers most projects)
  const { data: issuesData, isLoading: issuesLoading } = useIssues(
    project?.id ? { projectId: project.id, limit: 100 } : undefined,
  )

  const allIssues = issuesData?.data ?? []

  // Build a map of YYYY-MM-DD → Issue[] (all months, filtered by priority)
  const issuesByDate = useMemo(() => {
    const map = new Map<string, Issue[]>()
    for (const issue of allIssues) {
      if (!issue.dueDate) continue
      if (priorityFilter !== 'all' && issue.priority !== priorityFilter) continue
      const key = format(parseISO(issue.dueDate), 'yyyy-MM-dd')
      const existing = map.get(key) ?? []
      existing.push(issue)
      map.set(key, existing)
    }
    return map
  }, [allIssues, priorityFilter])

  // Stats for this month
  const monthStats = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
    let total = 0
    let activeDays = 0
    let maxOnDay = 0
    for (const day of days) {
      const count = (issuesByDate.get(format(day, 'yyyy-MM-dd')) ?? []).length
      total += count
      if (count > 0) activeDays++
      if (count > maxOnDay) maxOnDay = count
    }
    return { total, activeDays, maxOnDay }
  }, [issuesByDate, currentDate])

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate),
    })
    return { days, firstDayOffset: getDay(days[0]) }
  }, [currentDate])

  // Selected day issues
  const selectedDayIssues = useMemo(() => {
    if (!selectedDay) return []
    const key = format(selectedDay, 'yyyy-MM-dd')
    return issuesByDate.get(key) ?? []
  }, [selectedDay, issuesByDate])

  if (projectLoading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project?.name || 'Calendar'}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: 'Calendar' },
        ]}
      />

      <ProjectTabNav projectKey={projectKey!} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentDate((d) => subMonths(d, 1))
              setSelectedDay(null)
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold text-foreground min-w-[160px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentDate((d) => addMonths(d, 1))
              setSelectedDay(null)
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentDate(new Date())
              setSelectedDay(null)
            }}
          >
            Today
          </Button>
        </div>

        {/* Month stats */}
        {!issuesLoading && (
          <div className="flex items-center gap-4 ml-4 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{monthStats.total}</span>{' '}
              {monthStats.total === 1 ? 'issue' : 'issues'} due
            </span>
            <span>
              <span className="font-semibold text-foreground">{monthStats.activeDays}</span>{' '}
              active {monthStats.activeDays === 1 ? 'day' : 'days'}
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Select
            value={priorityFilter}
            onValueChange={(v) => {
              setPriorityFilter(v as PriorityFilter)
              setSelectedDay(null)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === 'all' ? 'All priorities' : p.charAt(0).toUpperCase() + p.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create Issue
          </Button>
        </div>
      </div>

      {/* Body: calendar + optional side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar area */}
        <div className="flex-1 overflow-auto p-4 bg-card">
          {issuesLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Loading issues…</div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-border">
                {/* Day headers */}
                {DAY_HEADERS.map((d) => (
                  <div
                    key={d}
                    className="bg-muted px-2 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {d}
                  </div>
                ))}

                {/* Leading empty cells */}
                {Array.from({ length: calendarDays.firstDayOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-gray-50 dark:bg-gray-900 min-h-[80px]" />
                ))}

                {/* Day cells */}
                {calendarDays.days.map((day) => {
                  const dateKey = format(day, 'yyyy-MM-dd')
                  const dayIssues = issuesByDate.get(dateKey) ?? []
                  const count = dayIssues.length
                  const level = heatLevel(count)
                  const isSelected = selectedDay ? isSameDay(day, selectedDay) : false
                  const visible = dayIssues.slice(0, MAX_CHIPS)
                  const overflow = count - MAX_CHIPS

                  return (
                    <div
                      key={dateKey}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      className={cn(
                        'relative min-h-[100px] p-1.5 flex flex-col gap-1 transition-all cursor-pointer',
                        HEAT_BG[level] || 'bg-card',
                        isSelected && 'ring-2 ring-inset ring-blue-500 z-10',
                        !isSelected && count > 0 && 'hover:brightness-95 dark:hover:brightness-110',
                        !isSelected && count === 0 && 'hover:bg-gray-50 dark:hover:bg-gray-750',
                      )}
                    >
                      {/* Date number */}
                      <span
                        className={cn(
                          'text-xs font-semibold self-end leading-none mb-0.5',
                          isToday(day)
                            ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px]'
                            : count > 0 ? HEAT_TEXT[level] : 'text-muted-foreground',
                        )}
                      >
                        {format(day, 'd')}
                      </span>

                      {/* Issue chips */}
                      {visible.map((issue) => (
                        <IssueChip key={issue.id} issue={issue} projectKey={projectKey!} />
                      ))}

                      {overflow > 0 && (
                        <span className="text-xs text-muted-foreground px-1.5">
                          +{overflow} more
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 mt-3 justify-end">
                <span className="text-xs text-muted-foreground">Issues due:</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: '0', bg: 'bg-gray-200 dark:bg-gray-700' },
                    { label: '1', bg: 'bg-blue-100 dark:bg-blue-900/40' },
                    { label: '2–3', bg: 'bg-blue-300 dark:bg-blue-700' },
                    { label: '4–6', bg: 'bg-blue-500 dark:bg-blue-600' },
                    { label: '7+', bg: 'bg-blue-700 dark:bg-blue-500' },
                  ].map(({ label, bg }) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className={cn('w-4 h-4 rounded', bg)} />
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side panel — shown when a day is selected */}
        {selectedDay && (
          <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {format(selectedDay, 'MMMM d, yyyy')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedDayIssues.length === 0
                    ? 'No issues due'
                    : `${selectedDayIssues.length} ${selectedDayIssues.length === 1 ? 'issue' : 'issues'} due`}
                </p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Issue list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {selectedDayIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <CalendarDays className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-sm text-muted-foreground">No issues due on this day</p>
                </div>
              ) : (
                selectedDayIssues.map((issue) => (
                  <IssuePanelCard key={issue.id} issue={issue} projectKey={projectKey!} />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={(isOpen) => !isOpen && issueFormRef.current?.requestClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Issue</DialogTitle>
          </DialogHeader>
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
    </div>
  )
}
