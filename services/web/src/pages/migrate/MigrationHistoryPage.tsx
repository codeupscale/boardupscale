import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useMigrationHistory, useRetryMigrationFromHistory, MigrationRun } from '@/hooks/useMigration'
import { useQueryClient } from '@tanstack/react-query'

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="h-3.5 w-3.5" />,
    className: 'bg-muted text-muted-foreground',
  },
  processing: {
    label: 'In Progress',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'bg-muted text-muted-foreground',
  },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        cfg.className,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function RunCard({ run, onRetry }: { run: MigrationRun; onRetry: (id: string) => void }) {
  const navigate = useNavigate()
  const projectNames = (run.selectedProjects ?? [])
    .map((p) => p.name || p.key)
    .slice(0, 3)
    .join(', ')
  const moreProjects = (run.selectedProjects ?? []).length - 3

  const duration =
    run.completedAt && run.startedAt
      ? Math.round(
          (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 60000,
        )
      : null

  const isRetryable = run.status === 'failed' || run.status === 'cancelled'

  return (
    <Card
      className={cn(
        'transition-colors',
        run.status === 'failed'
          ? 'border-red-200 dark:border-red-900'
          : 'hover:border-border',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => navigate(`/settings/migrate/report/${run.id}`)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={run.status} />
              {run.selectedProjects && run.selectedProjects.length > 0 && (
                <span className="text-sm text-muted-foreground truncate">
                  {projectNames}
                  {moreProjects > 0 && (
                    <span className="text-muted-foreground"> +{moreProjects} more</span>
                  )}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span>
                {run.processedIssues.toLocaleString()} / {run.totalIssues.toLocaleString()} issues
              </span>
              {run.failedIssues > 0 && (
                <span className="text-red-500">{run.failedIssues} failed</span>
              )}
              {duration !== null && <span>{duration}m</span>}
              <span>{format(new Date(run.createdAt), 'MMM d, yyyy HH:mm')}</span>
            </div>
          </div>

          {/* Retry button for failed/cancelled runs */}
          {isRetryable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(run.id)}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              aria-label={`Retry migration ${run.id}`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function MigrationHistoryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useMigrationHistory(page, 20)
  const retryMutation = useRetryMigrationFromHistory()

  const runs = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  async function handleRetry(runId: string) {
    const result = await retryMutation.mutateAsync(runId)
    if (result?.runId) {
      // Invalidate history so the status badge updates
      queryClient.invalidateQueries({ queryKey: ['migration-history'] })
      navigate('/settings/migrate/jira')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Migration History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All Jira migration runs for this organisation.
          </p>
        </div>
        <Button
          onClick={() => navigate('/settings/migrate/jira')}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Migration
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-56" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No migrations yet.</p>
            <Button className="mt-4" onClick={() => navigate('/settings/migrate/jira')}>
              Start your first migration
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} onRetry={handleRetry} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      </div>
    </div>
  )
}
