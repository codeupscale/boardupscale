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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useMigrationHistory, MigrationRun } from '@/hooks/useMigration'

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="h-3.5 w-3.5" />,
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  processing: {
    label: 'In Progress',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
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
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
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

function RunCard({ run }: { run: MigrationRun }) {
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

  return (
    <Card className="hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={run.status} />
              {run.selectedProjects && run.selectedProjects.length > 0 && (
                <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {projectNames}
                  {moreProjects > 0 && (
                    <span className="text-gray-400"> +{moreProjects} more</span>
                  )}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
              <span>
                {run.processedIssues.toLocaleString()} / {run.totalIssues.toLocaleString()} issues
              </span>
              {run.failedIssues > 0 && (
                <span className="text-red-500">{run.failedIssues} failed</span>
              )}
              {duration !== null && <span>{duration}m</span>}
              <span>
                {format(new Date(run.createdAt), 'MMM d, yyyy HH:mm')}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function MigrationHistoryPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useMigrationHistory(page, 20)

  const runs = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Migration History
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
            <p className="text-gray-500 dark:text-gray-400">No migrations yet.</p>
            <Button
              className="mt-4"
              onClick={() => navigate('/settings/migrate/jira')}
            >
              Start your first migration
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
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
          <span className="text-sm text-gray-600 dark:text-gray-400">
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
  )
}
