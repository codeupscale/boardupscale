import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useMigrationReport, useRetryMigration } from '@/hooks/useMigration'

interface CompleteStepProps {
  runId: string
}

export function CompleteStep({ runId }: CompleteStepProps) {
  const navigate = useNavigate()
  const [failedExpanded, setFailedExpanded] = useState(false)
  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const { data: report, isLoading } = useMigrationReport(runId)
  const retryMutation = useRetryMigration()

  const summary = report?.resultSummary
  const failedItems = summary?.failedItems ?? []
  const hasFailures = failedItems.length > 0 || (report?.failedIssues ?? 0) > 0
  const projectBreakdown = summary?.projects ?? []

  function handleDownloadReport() {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `migration-report-${runId.slice(0, 8)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleRetry() {
    const result = await retryMutation.mutateAsync(runId)
    if (result?.runId) {
      navigate('/settings/migrate/jira')
    }
  }

  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="text-center py-6">
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Migration Complete</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Your Jira data has been successfully imported into Boardupscale.
        </p>
      </div>

      {/* Summary stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 text-center">
                <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-2" />
                <div className="h-4 w-16 mx-auto bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Projects', value: report?.totalProjects ?? 0 },
            { label: 'Issues', value: summary?.totalMigrated ?? report?.processedIssues ?? 0 },
            { label: 'Members', value: report?.processedMembers ?? 0 },
            { label: 'Sprints', value: report?.processedSprints ?? 0 },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Project breakdown accordion */}
      {!isLoading && projectBreakdown.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <button
              onClick={() => setProjectsExpanded((v) => !v)}
              className="w-full flex items-center justify-between p-4 text-left"
              aria-expanded={projectsExpanded}
            >
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Project Breakdown
              </span>
              {projectsExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {projectsExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {projectBreakdown.map((proj) => (
                  <div key={proj.key} className="px-4 py-3 flex items-center gap-3">
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 w-16 text-center flex-shrink-0">
                      {proj.key}
                    </span>
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                      {proj.name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                      {proj.issueCount.toLocaleString()} issues
                    </span>
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full flex-shrink-0',
                        proj.status === 'success'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : proj.status === 'partial'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                      )}
                    >
                      {proj.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Failed items accordion */}
      {hasFailures && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-0">
            <button
              onClick={() => setFailedExpanded((v) => !v)}
              className="w-full flex items-center justify-between p-4 text-left"
              aria-expanded={failedExpanded}
            >
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {failedItems.length > 0
                  ? `${failedItems.length} items failed to migrate`
                  : `${report?.failedIssues ?? 0} issues failed`}
              </span>
              {failedExpanded ? (
                <ChevronUp className="h-4 w-4 text-amber-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-amber-500" />
              )}
            </button>
            {failedExpanded && (
              <div className="border-t border-amber-200 dark:border-amber-800 p-4 max-h-60 overflow-y-auto">
                {failedItems.length > 0 ? (
                  <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                    {failedItems.map((item, i) => (
                      <li key={i} className="font-mono">
                        {item.key || item.type}: {item.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500">
                    Download the full report for detailed error information.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {hasFailures && (
          <Button
            variant="outline"
            onClick={handleRetry}
            disabled={retryMutation.isPending}
            className="flex items-center gap-2"
          >
            {retryMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Retry Failed Items
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleDownloadReport}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download Report
        </Button>
        <Button
          className="flex items-center gap-2 sm:ml-auto"
          onClick={() => navigate('/projects')}
        >
          Go to Workspace
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

