import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { useRuleLogs } from '@/hooks/useAutomation'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface ExecutionLogProps {
  ruleId: string
}

const STATUS_ICONS: Record<string, any> = {
  success: { icon: CheckCircle, color: 'text-green-500' },
  partial_failure: { icon: AlertTriangle, color: 'text-yellow-500' },
  failed: { icon: XCircle, color: 'text-red-500' },
}

export function ExecutionLog({ ruleId }: ExecutionLogProps) {
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data, isLoading } = useRuleLogs(ruleId, page)

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    )
  }

  const logs = data?.logs || []
  const meta = data?.meta

  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No execution logs yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const statusInfo = STATUS_ICONS[log.status] || STATUS_ICONS.failed
        const StatusIcon = statusInfo.icon
        const isExpanded = expandedId === log.id

        return (
          <div
            key={log.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : log.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}
              <StatusIcon className={cn('h-4 w-4 flex-shrink-0', statusInfo.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {log.triggerEvent}
                  </span>
                  {log.issue && (
                    <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {log.issue.key}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">
                {new Date(log.executedAt).toLocaleString()}
              </span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                {log.errorMessage && (
                  <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {log.errorMessage}
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions Executed
                  </p>
                  {(log.actionsExecuted || []).map((action: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm"
                    >
                      {action.status === 'success' ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="text-gray-700">{action.type}</span>
                      {action.error && (
                        <span className="text-xs text-red-500">({action.error})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-gray-500">
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
