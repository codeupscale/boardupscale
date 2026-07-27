import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ProjectHealthStatus } from '@/hooks/useOrgDashboard'
import {
  flattenProjectHealthPages,
  PROJECT_HEALTH_HEADER_HEIGHT_PX,
  PROJECT_HEALTH_ROW_HEIGHT_PX,
  PROJECT_HEALTH_VIEWPORT_ROWS,
  resolveProjectHealthViewState,
  shouldFetchNextProjectHealthPage,
  useOrgProjectHealth,
} from '@/hooks/useOrgProjectHealth'
import { HEALTH_STATUS_LABELS } from '@/components/dashboard/dashboard-chart-theme'

const STATUS_BADGE: Record<
  ProjectHealthStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'primary' }
> = {
  active: { label: HEALTH_STATUS_LABELS.active, variant: 'success' },
  at_risk: { label: HEALTH_STATUS_LABELS.at_risk, variant: 'warning' },
  blocked: { label: HEALTH_STATUS_LABELS.blocked, variant: 'danger' },
      completed: { label: HEALTH_STATUS_LABELS.completed, variant: 'primary' },
}

const COLS = [
  { key: 'project', width: '17%' },
  { key: 'key', width: '9%' },
  { key: 'type', width: '8%' },
  { key: 'open', width: '6%' },
  { key: 'blocked', width: '7%' },
  { key: 'overdue', width: '7%' },
  { key: 'done', width: '6%' },
  { key: 'sprint', width: '10%' },
  { key: 'status', width: '10%' },
  { key: 'progress', width: '20%' },
] as const

interface ProjectHealthTableProps {
  statusFilter?: ProjectHealthStatus | 'all'
}

export function ProjectHealthTable({
  statusFilter = 'all',
}: ProjectHealthTableProps) {
  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useOrgProjectHealth(statusFilter)

  const rows = useMemo(
    () => flattenProjectHealthPages(data?.pages),
    [data],
  )
  const total = data?.pages[0]?.total ?? 0
  const viewState = resolveProjectHealthViewState({
    isLoading,
    isError,
    rowsLength: rows.length,
  })

  const parentRef = useRef<HTMLDivElement>(null)
  const viewportHeight =
    PROJECT_HEALTH_HEADER_HEIGHT_PX +
    PROJECT_HEALTH_VIEWPORT_ROWS * PROJECT_HEALTH_ROW_HEIGHT_PX

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => PROJECT_HEALTH_ROW_HEIGHT_PX,
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1]
    if (
      !shouldFetchNextProjectHealthPage({
        lastVisibleIndex: last?.index,
        rowsLength: rows.length,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
      })
    ) {
      return
    }
    void fetchNextPage()
  }, [
    virtualItems,
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ])

  return (
    <Card className="w-full min-w-0 border-border/80 bg-card/90 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            Project Health Overview
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {statusFilter !== 'all'
              ? `Filtered by ${HEALTH_STATUS_LABELS[statusFilter]}`
              : total > 0
                ? `${total} projects`
                : 'Organization projects'}
            {total > PROJECT_HEALTH_VIEWPORT_ROWS
              ? ' · scroll for more'
              : null}
          </p>
        </div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-sm text-violet-500 hover:text-violet-400 font-medium shrink-0"
        >
          View All Projects
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {viewState === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading project health…
          </div>
        ) : viewState === 'error' ? (
          <div className="py-10 text-center px-5 space-y-2">
            <p className="text-sm text-muted-foreground">
              Could not load project health.
            </p>
            <button
              type="button"
              className="text-sm text-violet-400 hover:text-violet-300 font-medium"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        ) : viewState === 'empty' ? (
          <p className="text-sm text-muted-foreground py-10 text-center px-5">
            {statusFilter === 'all'
              ? 'No projects in this organization yet.'
              : 'No projects match this status filter.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div
              ref={parentRef}
              className="relative overflow-y-auto"
              style={{ height: viewportHeight }}
            >
              <table className="w-full table-fixed text-sm border-collapse min-w-[1120px]">
                <colgroup>
                  {COLS.map((col) => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr
                    className="border-y border-border bg-muted/95 text-muted-foreground backdrop-blur-sm"
                    style={{ height: PROJECT_HEALTH_HEADER_HEIGHT_PX }}
                  >
                    <th className="py-2.5 pl-5 pr-3 font-medium text-left">
                      Project
                    </th>
                    <th className="py-2.5 px-3 font-medium text-left">Key</th>
                    <th className="py-2.5 px-3 font-medium text-left">Type</th>
                    <th className="py-2.5 px-3 font-medium text-right">Open</th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      Blocked
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      Overdue
                    </th>
                    <th className="py-2.5 pl-3 pr-6 font-medium text-right">
                      Done
                    </th>
                    <th className="py-2.5 pl-6 pr-3 font-medium text-left">
                      Active Sprint
                    </th>
                    <th className="py-2.5 px-3 font-medium text-left">Status</th>
                    <th className="py-2.5 pl-3 pr-5 font-medium text-left">
                      Progress
                    </th>
                  </tr>
                </thead>
                <tbody
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    position: 'relative',
                  }}
                >
                  {virtualItems.map((virtualRow) => {
                    const row = rows[virtualRow.index]
                    const badge = STATUS_BADGE[row.status]
                    return (
                      <tr
                        key={row.projectId}
                        className="border-b border-border/60 hover:bg-muted/20 transition-colors absolute w-full table table-fixed"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          minWidth: 1120,
                        }}
                      >
                        <td
                          className="py-3 pl-5 pr-3"
                          style={{ width: COLS[0].width }}
                        >
                          <Link
                            to={`/projects/${row.key}`}
                            className="font-medium text-foreground hover:text-violet-500 block truncate"
                            title={row.name}
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td
                          className="py-3 px-3 text-muted-foreground"
                          style={{ width: COLS[1].width }}
                        >
                          <Link
                            to={`/projects/${row.key}`}
                            className="hover:text-violet-500 font-mono text-xs block truncate"
                            title={row.key}
                          >
                            {row.key}
                          </Link>
                        </td>
                        <td
                          className="py-3 px-3 capitalize text-muted-foreground truncate"
                          style={{ width: COLS[2].width }}
                        >
                          {row.type}
                        </td>
                        <td
                          className="py-3 px-3 text-right tabular-nums"
                          style={{ width: COLS[3].width }}
                        >
                          {row.openIssues}
                        </td>
                        <td
                          className={cn(
                            'py-3 px-3 text-right tabular-nums',
                            row.blockedIssues > 0 &&
                              'text-destructive font-medium',
                          )}
                          style={{ width: COLS[4].width }}
                        >
                          {row.blockedIssues}
                        </td>
                        <td
                          className={cn(
                            'py-3 px-3 text-right tabular-nums',
                            row.overdueIssues > 0 &&
                              'text-destructive font-medium',
                          )}
                          style={{ width: COLS[5].width }}
                        >
                          {row.overdueIssues}
                        </td>
                        <td
                          className="py-3 pl-3 pr-6 text-right tabular-nums text-muted-foreground"
                          style={{ width: COLS[6].width }}
                        >
                          {row.doneIssues ?? 0}
                        </td>
                        <td
                          className="py-3 pl-6 pr-3 text-muted-foreground"
                          style={{ width: COLS[7].width }}
                        >
                          <span
                            className="block truncate"
                            title={row.activeSprintName ?? undefined}
                          >
                            {row.activeSprintName ?? '—'}
                          </span>
                        </td>
                        <td
                          className="py-3 px-3"
                          style={{ width: COLS[8].width }}
                        >
                          <Badge
                            variant={badge.variant}
                            className="whitespace-nowrap"
                          >
                            {badge.label}
                          </Badge>
                        </td>
                        <td
                          className="py-3 pl-3 pr-5"
                          style={{ width: COLS[9].width }}
                        >
                          <div className="flex items-center gap-2 min-w-0 w-full">
                            <div className="flex-1 h-1.5 rounded-full bg-violet-500/15 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-violet-500"
                                style={{
                                  width: `${Math.min(100, row.progressPercent)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right shrink-0">
                              {row.progressPercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-border/60 text-xs text-muted-foreground">
              <span>
                Showing {rows.length} of {total}
              </span>
              {isFetchingNextPage ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more…
                </span>
              ) : hasNextPage ? (
                <span>Scroll for more</span>
              ) : (
                <span>End of list</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
