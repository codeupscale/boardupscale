import { AlertTriangle, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  useLatestSearchReindex,
  useStartSearchReindex,
  useCancelSearchReindex,
  useRetrySearchReindex,
  useSearchReindexStatus,
  getSearchReindexProgressPercent,
  SearchReindexJobStatus,
} from '@/hooks/useSearchReindex'
import { cn } from '@/lib/utils'

interface SearchReindexPanelProps {
  projectId: string
}

function statusVariant(status: SearchReindexJobStatus['status']): 'default' | 'secondary' | 'danger' | 'outline' {
  switch (status) {
    case 'completed':
      return 'secondary'
    case 'failed':
    case 'stalled':
      return 'danger'
    case 'cancelled':
      return 'outline'
    default:
      return 'default'
  }
}

export function SearchReindexPanel({ projectId }: SearchReindexPanelProps) {
  const { t } = useTranslation()
  const latest = useLatestSearchReindex(projectId)
  const status = useSearchReindexStatus(latest.data?.id)
  const startReindex = useStartSearchReindex(projectId)
  const cancelReindex = useCancelSearchReindex()
  const retryReindex = useRetrySearchReindex()

  const activeJob = status.data ?? latest.data
  const isLoading = latest.isLoading || status.isLoading
  const isActive =
    activeJob?.status === 'pending' ||
    activeJob?.status === 'processing' ||
    activeJob?.status === 'stalled'
  const progress = getSearchReindexProgressPercent(activeJob)

  const handleStart = () => {
    startReindex.mutate()
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t('search.reindex.title', { defaultValue: 'Search index' })}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('search.reindex.description', {
              defaultValue:
                'Rebuild Elasticsearch for this project. Does not affect live search speed — runs in the background.',
            })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleStart}
          disabled={isActive || startReindex.isPending || isLoading}
        >
          {startReindex.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('search.reindex.start', { defaultValue: 'Reindex' })}
        </Button>
      </div>

      {activeJob && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant(activeJob.status)} className="capitalize">
              {activeJob.status}
            </Badge>
            {activeJob.queueState && (
              <span className="text-xs text-muted-foreground font-mono">
                queue: {activeJob.queueState}
              </span>
            )}
          </div>

          {(activeJob.status === 'processing' || activeJob.status === 'pending') && (
            <div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full bg-primary transition-all duration-300',
                    activeJob.status === 'pending' && 'animate-pulse',
                  )}
                  style={{ width: `${activeJob.status === 'pending' ? 20 : progress}%` }}
                />
              </div>
              {activeJob.status === 'processing' ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('search.reindex.progress', {
                    defaultValue: '{{issues}}/{{issueTotal}} issues · {{members}}/{{memberTotal}} members',
                    issues: activeJob.processedIssues ?? 0,
                    issueTotal: activeJob.totalIssues ?? 0,
                    members: activeJob.processedMembers ?? 0,
                    memberTotal: activeJob.totalMembers ?? 0,
                  })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  {activeJob.queueState === 'waiting'
                    ? 'Queued…'
                    : activeJob.queueState
                      ? `Queue state: ${activeJob.queueState}`
                      : 'Queued…'}
                </p>
              )}
            </div>
          )}

          {activeJob.status === 'stalled' && activeJob.stallReason && (
            <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{activeJob.stallReason}</span>
            </div>
          )}

          {activeJob.status === 'failed' && activeJob.errorLog?.length ? (
            <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
              {activeJob.errorLog[activeJob.errorLog.length - 1]}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            {(activeJob.status === 'pending' || activeJob.status === 'processing') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelReindex.mutate(activeJob.id)}
                disabled={cancelReindex.isPending}
              >
                <XCircle className="h-4 w-4" />
                {t('search.reindex.cancel', { defaultValue: 'Cancel' })}
              </Button>
            )}
            {(activeJob.status === 'failed' ||
              activeJob.status === 'cancelled' ||
              activeJob.status === 'stalled') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => retryReindex.mutate(activeJob.id)}
                disabled={retryReindex.isPending}
              >
                <RefreshCw className={cn('h-4 w-4', retryReindex.isPending && 'animate-spin')} />
                {t('search.reindex.retry', { defaultValue: 'Retry' })}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
