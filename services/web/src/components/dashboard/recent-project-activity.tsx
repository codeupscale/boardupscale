import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatRelativeTime } from '@/lib/utils'
import { ProjectFilterSelect } from '@/components/dashboard/project-filter-select'
import type { ActivityFeedItem } from '@/hooks/useOrgDashboard'
import type { MemberScopedProject } from '@/hooks/useMemberDashboard'
import {
  PROJECT_HEALTH_HEADER_HEIGHT_PX,
  PROJECT_HEALTH_ROW_HEIGHT_PX,
} from '@/hooks/useOrgProjectHealth'

interface RecentProjectActivityProps {
  recent: ActivityFeedItem[]
  /** Must match the row count passed as `viewportRows` to "My Projects Overview". */
  rowCount?: number
  projects?: MemberScopedProject[]
  selectedProjectId?: string
  onProjectChange?: (projectId: string | undefined) => void
  isProjectsLoading?: boolean
  isProjectsError?: boolean
  onRetryProjects?: () => void
  /** True while this widget's filtered data is being refetched (old data stays visible). */
  isRefreshing?: boolean
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
 *  Each row is fixed at PROJECT_HEALTH_ROW_HEIGHT_PX (same as a "My Projects
 *  Overview" table row) so 8 items naturally reach the same total height as
 *  that table's 8 rows — no CSS stretch/fill trick needed, no gap. */
export function RecentProjectActivity({
  recent,
  rowCount = 8,
  projects,
  selectedProjectId,
  onProjectChange,
  isProjectsLoading,
  isProjectsError,
  onRetryProjects,
  isRefreshing,
}: RecentProjectActivityProps) {
  const rowHeight = computeActivityRowHeight(rowCount)

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
        <p className="text-xs text-muted-foreground mt-0.5">Last {recent.length} updates</p>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="flex h-full items-center justify-center px-5 py-10 text-center text-sm text-muted-foreground">
              No activity in your projects yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {recent.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 text-sm px-5"
                  style={{ height: rowHeight }}
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
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-border/60">
          <Link
            to="/issues"
            className="text-xs font-medium text-violet-400 hover:text-violet-300"
          >
            View all activity →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
