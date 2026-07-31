import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatRelativeTime } from '@/lib/utils'
import { ProjectFilterSelect } from '@/components/dashboard/project-filter-select'
import {
  useMemberActivityFeed,
  flattenActivityFeedPages,
  resolveActivityFeedViewState,
  shouldFetchNextActivityPage,
} from '@/hooks/useMemberActivityFeed'
import type { MemberScopedProject } from '@/hooks/useMemberDashboard'
import {
  PROJECT_HEALTH_HEADER_HEIGHT_PX,
  PROJECT_HEALTH_ROW_HEIGHT_PX,
} from '@/hooks/useOrgProjectHealth'

interface RecentProjectActivityProps {
  /** Must match the row count passed as `viewportRows` to "My Projects Overview". */
  rowCount?: number
  projects?: MemberScopedProject[]
  selectedProjectId?: string
  onProjectChange?: (projectId: string | undefined) => void
  isProjectsLoading?: boolean
  isProjectsError?: boolean
  onRetryProjects?: () => void
}

/**
 * The table has an extra 40px thead row (column labels) that this feed has no
 * equivalent for. Spread that difference across all rows instead of leaving
 * it as one lump gap, so N rows here total the exact same height as the
 * table's (thead + N × row height) — no stretch/fill hacks, just matching math.
 */
function computeActivityRowHeight(rowCount: number): number {
  return (
    (PROJECT_HEALTH_HEADER_HEIGHT_PX + rowCount * PROJECT_HEALTH_ROW_HEIGHT_PX) / rowCount
  )
}

function actionLabel(action: string): string {
  switch (action) {
    case 'created':
      return 'created'
    case 'assigned':
      return 'assigned'
    case 'commented':
      return 'commented on'
    case 'status_changed':
      return 'updated status of'
    case 'updated':
      return 'updated'
    default:
      return action.replace(/_/g, ' ')
  }
}

/** Member dashboard — activity feed scoped to the viewer's own + enrolled projects.
 *  Keyset-paged, infinite scroll (like "My Projects Overview"): the visible
 *  viewport stays fixed at `rowCount` rows tall so card heights keep
 *  matching, but scrolling past the loaded rows fetches more automatically
 *  with no upper limit. */
export function RecentProjectActivity({
  rowCount = 8,
  projects,
  selectedProjectId,
  onProjectChange,
  isProjectsLoading,
  isProjectsError,
  onRetryProjects,
}: RecentProjectActivityProps) {
  const rowHeight = computeActivityRowHeight(rowCount)

  const {
    data,
    isLoading,
    isError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useMemberActivityFeed(selectedProjectId)

  const items = flattenActivityFeedPages(data?.pages)
  const viewState = resolveActivityFeedViewState({
    isLoading,
    isError,
    itemsLength: items.length,
  })
  const isRefreshing = isFetching && !isLoading && !isFetchingNextPage

  const parentRef = useRef<HTMLDivElement>(null)
  const viewportHeight = rowCount * rowHeight

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1]
    if (
      !shouldFetchNextActivityPage({
        lastVisibleIndex: last?.index,
        itemsLength: items.length,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
      })
    ) {
      return
    }
    void fetchNextPage()
  }, [virtualItems, items.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <Card className="w-full h-full min-w-0 border-border/80 bg-card/90 overflow-hidden flex flex-col">
      <CardHeader className="px-5 pt-4 pb-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground">Recent Project Activity</h3>
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
                label="Filter Recent Project Activity by project"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        {viewState === 'loading' ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activity…
          </div>
        ) : viewState === 'error' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <p>Could not load recent activity.</p>
            <button
              type="button"
              className="text-sm font-medium text-violet-400 hover:text-violet-300"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        ) : viewState === 'empty' ? (
          <div className="flex h-full items-center justify-center px-5 py-10 text-center text-sm text-muted-foreground">
            No activity in your projects yet.
          </div>
        ) : (
          <div
            ref={parentRef}
            className="overflow-y-auto"
            style={{ height: viewportHeight }}
          >
            <ul
              className="relative divide-y divide-border/60"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualItems.map((virtualRow) => {
                const item = items[virtualRow.index]
                return (
                  <li
                    key={item.id}
                    className="absolute inset-x-0 flex items-center gap-2.5 text-sm px-5"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <Avatar
                      src={item.userAvatarUrl ?? undefined}
                      name={item.userDisplayName ?? 'User'}
                      size="xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground leading-snug truncate">
                        <span className="font-medium">{item.userDisplayName ?? 'Someone'}</span>{' '}
                        <span className="text-muted-foreground">{actionLabel(item.action)}</span>{' '}
                        <span className="font-medium text-violet-400">
                          {item.issueKey ? item.issueKey : item.target}
                        </span>
                        {item.projectKey ? (
                          <span className="text-muted-foreground"> in {item.projectKey}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            {isFetchingNextPage && (
              <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading more…
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
