import { useEffect, useState } from 'react'
import { CheckSquare, Square, Loader2, Clock, FileText, Users, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePreviewMigration, PreviewProject } from '@/hooks/useMigration'
import { ConnectJiraResult } from '@/hooks/useMigration'

interface PreviewStepProps {
  runId: string
  connectResult: ConnectJiraResult
  onNext: (selectedKeys: string[], preview: PreviewProject[]) => void
  onBack: () => void
}

export function PreviewStep({ runId, connectResult, onNext, onBack }: PreviewStepProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const previewMutation = usePreviewMigration()

  // Auto-fetch preview on mount with all available project keys
  useEffect(() => {
    const allKeys = connectResult.projects.map((p) => p.key)
    previewMutation.mutate({ runId, projectKeys: allKeys })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const projects = previewMutation.data?.projects ?? []
  const isLoading = previewMutation.isPending

  // Merge project names from connectResult into preview data
  const enrichedProjects = projects.map((p) => {
    const conn = connectResult.projects.find((cp) => cp.key === p.key)
    return { ...p, name: conn?.name || p.name || p.key }
  })

  const selectedProjects = enrichedProjects.filter((p) => selectedKeys.has(p.key))
  const totalIssues = selectedProjects.reduce((s, p) => s + p.issueCount, 0)
  const totalSprints = selectedProjects.reduce((s, p) => s + p.sprintCount, 0)
  const estimatedMinutes = Math.max(1, Math.ceil(totalIssues / 100))

  function toggleProject(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelectedKeys(new Set(enrichedProjects.map((p) => p.key)))
  }

  function deselectAll() {
    setSelectedKeys(new Set())
  }

  const allSelected = enrichedProjects.length > 0 && selectedKeys.size === enrichedProjects.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Select Projects to Migrate
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose the Jira projects you want to import into Boardupscale.
        </p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Project list */}
      {!isLoading && enrichedProjects.length > 0 && (
        <>
          {/* Select all / deselect toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {enrichedProjects.length} projects available
            </span>
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {enrichedProjects.map((project) => {
              const isSelected = selectedKeys.has(project.key)
              return (
                <Card
                  key={project.key}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
                      : 'hover:border-gray-300 dark:hover:border-gray-600',
                  )}
                  onClick={() => toggleProject(project.key)}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === ' ' && toggleProject(project.key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      ) : (
                        <Square className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white truncate">
                            {project.name}
                          </span>
                          <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded flex-shrink-0">
                            {project.key}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {project.issueCount.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" />
                          {project.sprintCount}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Summary bar */}
      {selectedKeys.size > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Projects
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1">
                  {selectedKeys.size}
                </p>
              </div>
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Issues
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1">
                  {totalIssues.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Sprints
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1">{totalSprints}</p>
              </div>
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Est. Time
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  ~{estimatedMinutes}m
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={() =>
            onNext(
              Array.from(selectedKeys),
              enrichedProjects.filter((p) => selectedKeys.has(p.key)),
            )
          }
          disabled={selectedKeys.size === 0}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
