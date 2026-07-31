import { Loader2 } from 'lucide-react'
import { DashboardPanelCard } from '@/components/dashboard/dashboard-panel-card'
import { DashboardDonut } from '@/components/dashboard/dashboard-donut'
import { HealthStatusLegend } from '@/components/dashboard/health-status-legend'
import { ProjectFilterSelect } from '@/components/dashboard/project-filter-select'
import type { IssueStatusDonut, MemberScopedProject } from '@/hooks/useMemberDashboard'
import {
  getIssueStatusColor,
  getIssueStatusLabel,
} from '@/components/dashboard/dashboard-chart-theme'

interface IssueStatusDonutChartProps {
  title: string
  centerLabel: string
  data: IssueStatusDonut
  footerHref: string
  footerLabel: string
  className?: string
  projects?: MemberScopedProject[]
  selectedProjectId?: string
  onProjectChange?: (projectId: string | undefined) => void
  isProjectsLoading?: boolean
  isProjectsError?: boolean
  onRetryProjects?: () => void
  /** True while this widget's filtered data is being refetched (old data stays visible). */
  isRefreshing?: boolean
}

/** Member dashboard "Open Issues by Status" donut — issue category buckets, not project health. */
export function IssueStatusDonutChart({
  title,
  centerLabel,
  data,
  footerHref,
  footerLabel,
  className,
  projects,
  selectedProjectId,
  onProjectChange,
  isProjectsLoading,
  isProjectsError,
  onRetryProjects,
  isRefreshing,
}: IssueStatusDonutChartProps) {
  const hasData = data.total > 0

  return (
    <DashboardPanelCard
      title={title}
      footerHref={footerHref}
      footerLabel={footerLabel}
      className={className}
      headerExtra={
        onProjectChange ? (
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
              label="Filter Open Issues by Status by project"
            />
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 flex-1 min-h-0">
        <DashboardDonut
          segments={data.segments}
          total={data.total}
          centerLabel={centerLabel}
          getColor={getIssueStatusColor}
          getLabel={getIssueStatusLabel}
        />
        <HealthStatusLegend
          items={data.segments}
          className="w-full sm:flex-1"
          getColor={getIssueStatusColor}
          getLabel={getIssueStatusLabel}
        />
      </div>
      {!hasData && (
        <p className="text-[11px] text-muted-foreground">
          No issues to classify yet
        </p>
      )}
    </DashboardPanelCard>
  )
}
