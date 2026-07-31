import { Loader2, Rocket } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProjectFilterSelect } from '@/components/dashboard/project-filter-select'
import type { ActiveSprintSummary, MemberScopedProject } from '@/hooks/useMemberDashboard'

interface ActiveSprintOverviewProps {
  sprints: ActiveSprintSummary[]
  projects?: MemberScopedProject[]
  selectedProjectId?: string
  onProjectChange?: (projectId: string | undefined) => void
  isProjectsLoading?: boolean
  isProjectsError?: boolean
  onRetryProjects?: () => void
  /** True while this widget's filtered data is being refetched (old data stays visible). */
  isRefreshing?: boolean
}

function formatSprintDates(startDate: string | null, endDate: string | null): string {
  if (!startDate || !endDate) return '—'
  const start = new Date(startDate)
  const end = new Date(endDate)
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 44
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(139,92,246,0.15)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-foreground">
        {percent}%
      </span>
    </div>
  )
}

/** Member dashboard — active sprints across the viewer's own + enrolled projects. */
export function ActiveSprintOverview({
  sprints,
  projects,
  selectedProjectId,
  onProjectChange,
  isProjectsLoading,
  isProjectsError,
  onRetryProjects,
  isRefreshing,
}: ActiveSprintOverviewProps) {
  return (
    <Card className="w-full h-full min-w-0 border-border/80 bg-card/90 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 className="text-base font-semibold text-foreground">Active Sprint Overview</h3>
        {onProjectChange && (
          <div className="flex items-center gap-1.5">
            {isRefreshing && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            )}
            <ProjectFilterSelect
              projects={projects ?? []}
              value={selectedProjectId}
              onChange={onProjectChange}
              isLoading={isProjectsLoading}
              isError={isProjectsError}
              onRetry={onRetryProjects}
              label="Filter Active Sprint Overview by project"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-4 flex-1 flex flex-col min-h-0">
        {sprints.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              No active sprints in your projects.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sprints.map((sprint) => (
              <div
                key={sprint.sprintId}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                  <Rocket className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground truncate">{sprint.name}</span>
                    <Badge variant="success" className="whitespace-nowrap">Active</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {sprint.projectName}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatSprintDates(sprint.startDate, sprint.endDate)}
                    {sprint.daysLeft !== null ? ` · ${sprint.daysLeft} days left` : null}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    Total Issues
                  </p>
                  <p className="text-sm font-semibold text-foreground">{sprint.totalIssues}</p>
                </div>
                <ProgressRing percent={sprint.progressPercent} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
