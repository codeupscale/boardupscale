import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useStartMigration, useMigrationStatus, StartMigrationPayload } from '@/hooks/useMigration'
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

export function ProgressStep({ payload, onComplete }: ProgressStepProps) {
  const [runId, setRunId] = useState<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [activityLog, setActivityLog] = useState<LogEntry[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const startMutation = useStartMigration()

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
    }

    socket.on('migration:progress', handleProgress)
    return () => {
      socket.off('migration:progress', handleProgress)
    }
  }, [runId])

  // Watch for completion
  useEffect(() => {
    if (status?.status === 'completed' && runId) {
      addLog('Migration completed successfully')
      onComplete(runId)
    }
    if (status?.status === 'failed') {
      addLog('Migration failed — see error log for details')
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

  const currentPhase = status?.currentPhase ?? 0
  const totalIssues = status?.totalIssues ?? 0
  const processedIssues = status?.processedIssues ?? 0
  const overallPercent = totalIssues > 0 ? Math.round((processedIssues / totalIssues) * 100) : 0
  const statusText = status?.status ?? 'pending'
  const isFailed = statusText === 'failed'
  const isCompleted = statusText === 'completed'

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
            <span className="text-gray-500 dark:text-gray-400">{overallPercent}%</span>
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
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {processedIssues.toLocaleString()} / {totalIssues.toLocaleString()} issues
            </span>
            <span className={cn(
              'font-medium capitalize',
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
              const isActive = currentPhase === phase
              const isDone = currentPhase > phase || isCompleted
              const isPending = currentPhase < phase

              return (
                <li key={phase} className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : isActive ? (
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    ) : isFailed && isActive ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-gray-200 dark:border-gray-700" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-sm',
                      isDone
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : isActive
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-400 dark:text-gray-500',
                    )}
                  >
                    {label}
                  </span>
                  {isActive && !isFailed && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                      Running...
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

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

      {/* Failure message */}
      {isFailed && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Migration failed
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                The migration encountered an unrecoverable error. You can retry from the history
                page — completed phases will be skipped.
              </p>
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
              Cancelling will stop the migration. Progress made so far will be preserved and you
              can resume from the history page.
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
