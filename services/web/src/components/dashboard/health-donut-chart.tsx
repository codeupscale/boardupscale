import { useMemo } from 'react'
import { DashboardPanelCard } from '@/components/dashboard/dashboard-panel-card'
import { DashboardDonut } from '@/components/dashboard/dashboard-donut'
import { HealthStatusLegend } from '@/components/dashboard/health-status-legend'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DonutSection, ProjectHealthStatus } from '@/hooks/useOrgDashboard'
import {
  DonutSizeToken,
  PROJECT_HEALTH_STATUS_FILTER_OPTIONS,
  getHealthStatusLabel,
} from '@/components/dashboard/dashboard-chart-theme'

export type StatusChartFilter = ProjectHealthStatus | 'all'

interface HealthDonutChartProps {
  title: string
  centerLabel: string
  data: DonutSection
  footerHref: string
  footerLabel: string
  size?: DonutSizeToken
  className?: string
  /** Enable status filter dropdown + clickable legend (Projects by Status). */
  filterable?: boolean
  statusFilter?: StatusChartFilter
  onStatusFilterChange?: (next: StatusChartFilter) => void
}

function applyStatusFilter(
  data: DonutSection,
  statusFilter: StatusChartFilter,
): DonutSection {
  if (statusFilter === 'all') return data
  const segments = data.segments.filter((s) => s.key === statusFilter)
  const total = segments.reduce((sum, s) => sum + s.count, 0)
  return {
    total,
    segments: segments.map((s) => ({
      ...s,
      percent: total > 0 ? Math.round((s.count / total) * 100) : 0,
    })),
  }
}

/**
 * Org dashboard health / status panel — composes shared donut + legend + panel shell.
 */
export function HealthDonutChart({
  title,
  centerLabel,
  data,
  footerHref,
  footerLabel,
  size = 'lg',
  className,
  filterable = false,
  statusFilter = 'all',
  onStatusFilterChange,
}: HealthDonutChartProps) {
  const displayData = useMemo(
    () => (filterable ? applyStatusFilter(data, statusFilter) : data),
    [data, filterable, statusFilter],
  )
  const hasData = displayData.total > 0 || data.segments.some((s) => s.count > 0)

  const headerExtra =
    filterable && onStatusFilterChange ? (
      <Select
        value={statusFilter}
        onValueChange={(value) =>
          onStatusFilterChange(value as StatusChartFilter)
        }
      >
        <SelectTrigger
          className="h-8 w-[140px] text-xs border-border/80 bg-background/60"
          aria-label="Filter projects by status"
        >
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          {PROJECT_HEALTH_STATUS_FILTER_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null

  return (
    <DashboardPanelCard
      title={title}
      headerExtra={headerExtra}
      footerHref={footerHref}
      footerLabel={footerLabel}
      className={className}
    >
      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 flex-1 min-h-0">
        <DashboardDonut
          segments={displayData.segments}
          total={displayData.total}
          centerLabel={centerLabel}
          size={size}
        />
        <HealthStatusLegend
          items={filterable ? data.segments : displayData.segments}
          className="w-full sm:flex-1"
          selectedKey={filterable ? statusFilter : undefined}
          onSelect={
            filterable && onStatusFilterChange
              ? (key) => {
                  const next = key as ProjectHealthStatus
                  onStatusFilterChange(
                    statusFilter === next ? 'all' : next,
                  )
                }
              : undefined
          }
        />
      </div>
      {!hasData && (
        <p className="text-[11px] text-muted-foreground">
          No projects to classify yet
        </p>
      )}
      {filterable && statusFilter !== 'all' && (
        <p className="text-[11px] text-muted-foreground">
          Showing {getHealthStatusLabel(statusFilter)} only — click legend or
          choose All statuses to reset.
        </p>
      )}
    </DashboardPanelCard>
  )
}
