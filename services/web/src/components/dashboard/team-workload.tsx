import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ProjectFilterSelect } from '@/components/dashboard/project-filter-select'
import type {
  TeamWorkload as TeamWorkloadData,
  MemberScopedProject,
  WorkloadMember,
} from '@/hooks/useMemberDashboard'

interface TeamWorkloadProps {
  data: TeamWorkloadData
  projects?: MemberScopedProject[]
  selectedProjectId?: string
  onProjectChange?: (projectId: string | undefined) => void
  isProjectsLoading?: boolean
  isProjectsError?: boolean
  onRetryProjects?: () => void
  /** True while this widget's filtered data is being refetched (old data stays visible). */
  isRefreshing?: boolean
}

const CAPACITY_DOT: Record<WorkloadMember['capacity'], string> = {
  available: 'bg-emerald-500',
  near_capacity: 'bg-amber-500',
  overloaded: 'bg-red-500',
}

const CAPACITY_LABEL: Record<WorkloadMember['capacity'], string> = {
  available: 'Available',
  near_capacity: 'Near Capacity',
  overloaded: 'Overloaded',
}

/** Member dashboard — per-assignee workload listing across own + enrolled projects. */
export function TeamWorkload({
  data,
  projects,
  selectedProjectId,
  onProjectChange,
  isProjectsLoading,
  isProjectsError,
  onRetryProjects,
  isRefreshing,
}: TeamWorkloadProps) {
  const { topBusiest, capacitySummary } = data

  return (
    <Card className="w-full h-full min-w-0 border-border/80 bg-card/90 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 className="text-base font-semibold text-foreground">Team Workload</h3>
        <div className="flex items-center gap-2">
          {isRefreshing && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          )}
          {onProjectChange && (
            <ProjectFilterSelect
              projects={projects ?? []}
              value={selectedProjectId}
              onChange={onProjectChange}
              isLoading={isProjectsLoading}
              isError={isProjectsError}
              onRetry={onRetryProjects}
              label="Filter Team Workload by project"
            />
          )}
          <Link
            to="/settings/team"
            className="text-xs font-medium text-violet-400 hover:text-violet-300 whitespace-nowrap"
          >
            View all →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 flex-1 flex flex-col gap-4 min-h-0">
        {topBusiest.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              No assigned work in your projects yet.
            </p>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Top Busiest Members
              </p>
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="font-medium py-1.5 px-3 first:pl-0 truncate">Member</th>
                    <th className="font-medium py-1.5 px-3 truncate">Active</th>
                    <th className="font-medium py-1.5 px-3 truncate">In Progress</th>
                    <th className="font-medium py-1.5 px-3 truncate">Done</th>
                    <th className="font-medium py-1.5 px-3 truncate">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {topBusiest.map((m) => (
                    <tr key={m.userId}>
                      <td className="py-2 px-3 first:pl-0 truncate" title={m.displayName ?? undefined}>
                        {m.displayName ?? 'Unknown'}
                      </td>
                      <td className="py-2 px-3 tabular-nums">{m.activeCount}</td>
                      <td className="py-2 px-3 tabular-nums">{m.inProgressCount}</td>
                      <td className="py-2 px-3 tabular-nums">{m.doneCount}</td>
                      <td className="py-2 px-3" title={CAPACITY_LABEL[m.capacity]}>
                        <span className="flex items-center gap-1.5">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', CAPACITY_DOT[m.capacity])} />
                          <span className="truncate">{CAPACITY_LABEL[m.capacity]}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-4 text-xs pt-3 mt-auto border-t border-border/60">
              {(['available', 'near_capacity', 'overloaded'] as const).map((key) => (
                <span key={key} className="flex items-center gap-1.5 pt-3">
                  <span className={cn('h-2 w-2 rounded-full', CAPACITY_DOT[key])} />
                  <span className="text-muted-foreground">{CAPACITY_LABEL[key]}</span>
                  <span className="font-medium text-foreground">
                    {key === 'available'
                      ? capacitySummary.available
                      : key === 'near_capacity'
                        ? capacitySummary.nearCapacity
                        : capacitySummary.overloaded}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
