import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ProjectHealthRow, ProjectHealthStatus } from '@/hooks/useOrgDashboard'
import {
  flattenProjectHealthPages,
  PROJECT_HEALTH_HEADER_HEIGHT_PX,
  PROJECT_HEALTH_ROW_HEIGHT_PX,
  PROJECT_HEALTH_VIEWPORT_ROWS,
  resolveProjectHealthViewState,
  shouldFetchNextProjectHealthPage,
  useOrgProjectHealth,
  type ProjectHealthScope,
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

type ColumnAlign = 'left' | 'center' | 'right'

interface ColumnDef {
  key: string
  label: string
  /** Relative width vs. other visible columns — normalized to 100% per rendered column set (see resolveColumns). */
  weight: number
  /** Applied identically to the header label and its data cells, so they always line up. Defaults to 'left'. */
  align?: ColumnAlign
  render: (row: ProjectHealthRow) => React.ReactNode
}

function alignClass(align: ColumnAlign | undefined): string {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

function projectCell(row: ProjectHealthRow) {
  return (
    <Link
      to={`/projects/${row.key}`}
      className="font-medium text-foreground hover:text-violet-500 block truncate"
      title={row.name}
    >
      {row.name}
    </Link>
  )
}

function keyCell(row: ProjectHealthRow) {
  return (
    <Link
      to={`/projects/${row.key}`}
      className="hover:text-violet-500 font-mono text-xs block truncate"
      title={row.key}
    >
      {row.key}
    </Link>
  )
}

const FULL_COLUMNS: ColumnDef[] = [
  { key: 'project', label: 'Project', weight: 20, render: projectCell },
  { key: 'key', label: 'Key', weight: 9, render: keyCell },
  {
    key: 'type',
    label: 'Type',
    weight: 8,
    render: (row) => <span className="capitalize truncate block">{row.type}</span>,
  },
  {
    key: 'open',
    label: 'Open',
    weight: 6,
    align: 'center',
    render: (row) => row.openIssues,
  },
  {
    key: 'blocked',
    label: 'Blocked',
    weight: 7,
    align: 'center',
    render: (row) => (
      <span className={cn(row.blockedIssues > 0 && 'text-destructive font-medium')}>
        {row.blockedIssues}
      </span>
    ),
  },
  {
    key: 'overdue',
    label: 'Overdue',
    weight: 7,
    align: 'center',
    render: (row) => (
      <span className={cn(row.overdueIssues > 0 && 'text-destructive font-medium')}>
        {row.overdueIssues}
      </span>
    ),
  },
  {
    key: 'done',
    label: 'Done',
    weight: 6,
    align: 'center',
    render: (row) => <span className="text-muted-foreground">{row.doneIssues ?? 0}</span>,
  },
  {
    key: 'sprint',
    label: 'Active Sprint',
    weight: 11,
    align: 'center',
    render: (row) => (
      <span className="block truncate text-muted-foreground" title={row.activeSprintName ?? undefined}>
        {row.activeSprintName ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    weight: 8,
    render: (row) => {
      const badge = STATUS_BADGE[row.status]
      return (
        <Badge variant={badge.variant} className="whitespace-nowrap">
          {badge.label}
        </Badge>
      )
    },
  },
  {
    key: 'progress',
    label: 'Progress',
    weight: 18,
    render: (row) => (
      <div className="flex items-center gap-2 min-w-0 w-full">
        <div className="flex-1 h-1.5 rounded-full bg-violet-500/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500"
            style={{ width: `${Math.min(100, row.progressPercent)}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right shrink-0">
          {row.progressPercent}%
        </span>
      </div>
    ),
  },
]

/** Member dashboard's "My Projects Overview" drops Type/Blocked/Done — the fuller
 *  breakdown is more relevant at org-admin scale than for a single member's projects. */
const COMPACT_COLUMN_KEYS = new Set(['project', 'key', 'open', 'overdue', 'sprint', 'status', 'progress'])

/** Slight extra breathing room for these column labels/values. */
const SHIFT_RIGHT_COLUMN_KEYS = new Set(['status'])
/** Fixed-width digit rendering so counts don't jitter column width as values change. */
const NUMERIC_COLUMN_KEYS = new Set(['open', 'blocked', 'overdue', 'done'])

function cellPaddingClass(col: ColumnDef, i: number, total: number): string {
  if (i === 0) return 'pl-5 pr-3'
  if (i === total - 1) return 'pl-3 pr-5'
  return SHIFT_RIGHT_COLUMN_KEYS.has(col.key) ? 'pl-5 pr-3' : 'px-3'
}

interface ResolvedColumnDef extends ColumnDef {
  /** Percentage width, normalized so the visible column set always fills 100%. */
  widthPercent: number
}

/**
 * Data rows are each rendered as their own independent table (`table
 * table-fixed`, no colgroup — see the tbody below) so react-virtual can
 * absolutely-position them for virtualization. That means they never read
 * the outer table's `<colgroup>` — each row auto-splits its own columns
 * unless every cell in it carries an explicit width. So `widthPercent` here
 * is applied both to the header's `<colgroup>` and inline on every `<td>`,
 * keeping header and data in sync regardless of column weight.
 */
function resolveColumns(scope: ProjectHealthScope): ResolvedColumnDef[] {
  const visible =
    scope === 'member'
      ? FULL_COLUMNS.filter((c) => COMPACT_COLUMN_KEYS.has(c.key))
      : FULL_COLUMNS
  const totalWeight = visible.reduce((sum, c) => sum + c.weight, 0)
  return visible.map((c) => ({
    ...c,
    widthPercent: (c.weight / totalWeight) * 100,
  }))
}

interface ProjectHealthTableProps {
  statusFilter?: ProjectHealthStatus | 'all'
  scope?: ProjectHealthScope
  title?: string
  viewportRows?: number
}

export function ProjectHealthTable({
  statusFilter = 'all',
  scope = 'organization',
  title = 'Project Health Overview',
  viewportRows = PROJECT_HEALTH_VIEWPORT_ROWS,
}: ProjectHealthTableProps) {
  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useOrgProjectHealth(statusFilter, scope)

  const columns = useMemo(() => resolveColumns(scope), [scope])

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
    PROJECT_HEALTH_HEADER_HEIGHT_PX + viewportRows * PROJECT_HEALTH_ROW_HEIGHT_PX

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
    <Card className="w-full h-full min-w-0 border-border/80 bg-card/90 overflow-hidden flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {statusFilter !== 'all'
              ? `Filtered by ${HEALTH_STATUS_LABELS[statusFilter]}`
              : total > 0
                ? `${total} projects`
                : scope === 'member'
                  ? 'Your projects'
                  : 'Organization projects'}
            {total > viewportRows
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

      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
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
            {statusFilter !== 'all'
              ? 'No projects match this status filter.'
              : scope === 'member'
                ? 'You have no projects yet — create one or ask to be added to one.'
                : 'No projects in this organization yet.'}
          </p>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="overflow-x-auto">
              <div
                ref={parentRef}
                className="relative overflow-y-auto"
                style={{ height: viewportHeight }}
              >
                <table className="w-full table-fixed text-sm border-collapse min-w-[900px]">
                  <colgroup>
                    {columns.map((col) => (
                      <col key={col.key} style={{ width: `${col.widthPercent}%` }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr
                      className="border-y border-border bg-muted/95 text-muted-foreground backdrop-blur-sm"
                      style={{ height: PROJECT_HEALTH_HEADER_HEIGHT_PX }}
                    >
                      {columns.map((col, i) => (
                        <th
                          key={col.key}
                          className={cn(
                            'py-2.5 font-medium',
                            alignClass(col.align),
                            cellPaddingClass(col, i, columns.length),
                          )}
                        >
                          {col.label}
                        </th>
                      ))}
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
                      return (
                        <tr
                          key={row.projectId}
                          className="border-b border-border/60 hover:bg-muted/20 transition-colors absolute w-full table table-fixed"
                          style={{
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          {columns.map((col, i) => (
                            <td
                              key={col.key}
                              style={{ width: `${col.widthPercent}%` }}
                              className={cn(
                                'py-3',
                                alignClass(col.align),
                                NUMERIC_COLUMN_KEYS.has(col.key) && 'tabular-nums',
                                cellPaddingClass(col, i, columns.length),
                              )}
                            >
                              {col.render(row)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-border/60 text-xs text-muted-foreground mt-auto">
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
