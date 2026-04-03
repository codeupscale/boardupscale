import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  useStartMigration,
  useMigrationStatus,
  useRetryMigration,
  StartMigrationPayload,
} from '@/hooks/useMigration'
import { getSocket } from '@/lib/socket'

interface ProgressStepProps {
  payload: StartMigrationPayload
  onComplete: (runId: string) => void
}

const PHASE_LABELS: Record<number, string> = {
  0: 'Queued',
  1: 'Members',
  2: 'Projects',
  3: 'Sprints',
  4: 'Issues',
  5: 'Comments',
  6: 'Attachments',
}

interface LogEntry {
  time: string
  message: string
}

interface PhaseTime {
  startedAt: number
  completedAt?: number
}

export function ProgressStep({ payload, onComplete }: ProgressStepProps) {
  const [runId, setRunId] = useState<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [activityLog, setActivityLog] = useState<LogEntry[]>([])
  const [phaseTimes, setPhaseTimes] = useState<Record<number, PhaseTime>>({})
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const startMutation = useStartMigration()
  const retryMutation = useRetryMigration()

  const { data: status } = useMigrationStatus(runId)

  // Start migration on mount
  useEffect(() => {
    startMutation.mutateAsync(payload).then((res) => {
      setRunId(res.runId)
      addLog('Migration job queued')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to Socket.io migration:progress events
  useEffect(() => {
    const socket = getSocket()

    function handleProgress(data: {
      runId: string
      phase: number
      status: string
      counts: Record<string, number>
    }) {
      if (data.runId !== runId) return
      const label = PHASE_LABELS[data.phase] ?? `Phase ${data.phase}`
      addLog(`${label}: ${data.status}`)

      setPhaseTimes((prev) => {
        const existing = prev[data.phase]
        if (!existing) {
          return { ...prev, [data.phase]: { startedAt: Date.now() } }
        }
        if (data.status === 'completed' && !existing.completedAt) {
          return { ...prev, [data.phase]: { ...existing, completedAt: Date.now() } }
        }
        return prev
      })
    }

    socket.on('migration:progress', handleProgress)
    return () => {
      socket.off('migration:progress', handleProgress)
    }
  }, [runId])

  // Watch for completion or failure
  useEffect(() => {
    if (status?.status === 'completed' && runId) {
      addLog('Migration completed successfully')
      onComplete(runId)
    }
    if (status?.status === 'failed') {
      addLog('Migration failed — see error details below')
    }
  }, [status?.status, runId, onComplete])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activityLog])

  function addLog(message: string) {
    const time = new Date().toLocaleTimeString()
    setActivityLog((prev) => [...prev.slice(-49), { time, message }])
  }

  async function handleRetry() {
    if (!runId) return
    addLog('Retrying migration...')
    await retryMutation.mutateAsync(runId)
    addLog('Migration re-queued')
  }

  const currentPhase = status?.currentPhase ?? 0
  const totalIssues = status?.totalIssues ?? 0
  const processedIssues = status?.processedIssues ?? 0
  const totalMembers = status?.totalMembers ?? 0
  const processedMembers = status?.processedMembers ?? 0
  const totalSprints = status?.totalSprints ?? 0
  const processedSprints = status?.processedSprints ?? 0
  const overallPercent = totalIssues > 0 ? Math.round((processedIssues / totalIssues) * 100) : 0
  const statusText = status?.status ?? 'pending'
  const isFailed = statusText === 'failed'
  const isCompleted = statusText === 'completed'
  const isActive = statusText === 'processing'

  // Estimated time remaining based on issue throughput
  const issueRatePerSec =
    status?.startedAt && processedIssues > 0
      ? processedIssues / Math.max(1, (Date.now() - new Date(status.startedAt).getTime()) / 1000)
      : null
  const remainingIssues = totalIssues - processedIssues
  const etaSeconds = issueRatePerSec && remainingIssues > 0
    ? Math.round(remainingIssues / issueRatePerSec)
    : null

  function formatEta(secs: number): string {
    if (secs < 60) return `~${secs}s`
    if (secs < 3600) return `~${Math.round(secs / 60)}m`
    return `~${Math.round(secs / 3600)}h`
  }

  function formatPhaseDuration(phase: number): string | null {
    const pt = phaseTimes[phase]
    if (!pt) return null
    const end = pt.completedAt ?? Date.now()
    const secs = Math.round((end - pt.startedAt) / 1000)
    return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Migration in Progress
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Please keep this window open until the migration completes.
        </p>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900 dark:text-white">Overall progress</span>
            <div className="flex items-center gap-3">
              {etaSeconds !== null && isActive && (
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  {formatEta(etaSeconds)} remaining
                </span>
              )}
              <span className="text-gray-500 dark:text-gray-400">{isCompleted ? 100 : overallPercent}%</span>
            </div>
          </div>
          <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isFailed ? 'bg-red-500' : isCompleted ? 'bg-green-500' : 'bg-blue-500',
              )}
              style={{ width: `${isCompleted ? 100 : overallPercent}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {processedIssues.toLocaleString()} / {totalIssues.toLocaleString()} issues
            </span>
            <span>
              {processedMembers} / {totalMembers} members
            </span>
            <span className={cn(
              'font-medium capitalize text-right',
              isFailed ? 'text-red-500' : isCompleted ? 'text-green-500' : 'text-blue-500',
            )}>
              {statusText}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Phase stepper */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Phases</h3>
          <ol className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((phase) => {
              const label = PHASE_LABELS[phase]
              const isPhaseActive = currentPhase === phase && isActive
              const isPhaseFailedHere = isFailed && currentPhase === phase
              const isDone = currentPhase > phase || isCompleted
              const isPending = !isPhaseActive && !isPhaseFailedHere && !isDone
              const duration = formatPhaseDuration(phase)

              return (
                <li key={phase} className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : isPhaseActive ? (
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    ) : isPhaseFailedHere ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-200 dark:border-gray-700" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-sm flex-1',
                      isDone
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : isPhaseActive
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : isPhaseFailedHere
                        ? 'text-red-600 dark:text-red-400 font-medium'
                        : 'text-gray-400 dark:text-gray-500',
                    )}
                  >
                    {label}
                  </span>
                  {isDone && duration && (
                    <span className="text-xs text-green-500 dark:text-green-400 ml-auto flex-shrink-0">
                      {duration}
                    </span>
                  )}
                  {isPhaseActive && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
                      {phase === 4
                        ? `${processedIssues.toLocaleString()} / ${totalIssues.toLocaleString()}`
                        : phase === 1
                        ? `${processedMembers} / ${totalMembers}`
                        : phase === 3
                        ? `${processedSprints} / ${totalSprints}`
                        : 'Running...'}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Per-project progress (expandable) */}
      {payload.projectKeys.length > 0 && (isActive || isCompleted) && (
        <Card>
          <CardContent className="p-0">
            <button
              onClick={() => setProjectsExpanded((v) => !v)}
              className="w-full flex items-center justify-between p-4 text-left"
              aria-expanded={projectsExpanded}
            >
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Projects ({payload.projectKeys.length})
              </span>
              {projectsExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {projectsExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {payload.projectKeys.map((key) => (
                  <div key={key} className="px-4 py-3 flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 w-16 text-center flex-shrink-0">
                      {key}
                    </span>
                    <span className="flex-1 text-gray-600 dark:text-gray-300 truncate">
                      {key}
                    </span>
                    {isCompleted && (
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    )}
                    {isActive && currentPhase === 4 && (
                      <Loader2 className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity log */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Activity Log
          </h3>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 h-40 overflow-y-auto font-mono text-xs space-y-1">
            {activityLog.length === 0 && (
              <p className="text-gray-400 dark:text-gray-500">Waiting for activity...</p>
            )}
            {activityLog.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {entry.time}
                </span>
                <span className="text-gray-700 dark:text-gray-300">{entry.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Failure message with Retry button */}
      {isFailed && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Migration failed
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  An error occurred during migration. Completed phases will be skipped on retry.
                </p>
                <Button
                  onClick={handleRetry}
                  disabled={retryMutation.isPending}
                  className="mt-3 bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                  size="sm"
                >
                  {retryMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Retry Migration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel button */}
      {!isCompleted && !isFailed && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => setCancelDialogOpen(true)}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
          >
            Cancel Migration
          </Button>
        </div>
      )}

      {/* Cancel confirmation dialog */}
      {cancelDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Cancel Migration?
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Cancelling will stop the migration. Progress made so far is preserved and you can
              resume from the history page.
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                Keep Running
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => setCancelDialogOpen(false)}
              >
                Cancel Migration
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
