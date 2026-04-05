import { useEffect, useRef, useState, useCallback } from 'react'
import {
  CheckCircle2, Loader2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Users, FolderOpen,
  Zap, FileText, MessageSquare, Paperclip, Clock, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useStartMigration, useMigrationStatus, useRetryMigration, StartMigrationPayload,
} from '@/hooks/useMigration'
import { getSocket } from '@/lib/socket'

interface ProgressStepProps {
  payload: StartMigrationPayload
  onComplete: (runId: string) => void
}

interface PhaseConfig {
  id: number
  label: string
  icon: React.ElementType
  color: string
  bgColor: string
}

const PHASES: PhaseConfig[] = [
  { id: 1, label: 'Members',     icon: Users,          color: 'text-violet-600 dark:text-violet-400',  bgColor: 'bg-violet-50 dark:bg-violet-900/20'  },
  { id: 2, label: 'Projects',    icon: FolderOpen,     color: 'text-blue-600 dark:text-blue-400',      bgColor: 'bg-blue-50 dark:bg-blue-900/20'      },
  { id: 3, label: 'Sprints',     icon: Zap,            color: 'text-amber-600 dark:text-amber-400',    bgColor: 'bg-amber-50 dark:bg-amber-900/20'    },
  { id: 4, label: 'Issues',      icon: FileText,       color: 'text-indigo-600 dark:text-indigo-400',  bgColor: 'bg-indigo-50 dark:bg-indigo-900/20'  },
  { id: 5, label: 'Comments',    icon: MessageSquare,  color: 'text-teal-600 dark:text-teal-400',      bgColor: 'bg-teal-50 dark:bg-teal-900/20'      },
  { id: 6, label: 'Attachments', icon: Paperclip,      color: 'text-gray-600 dark:text-gray-400',      bgColor: 'bg-gray-50 dark:bg-gray-800'         },
]

interface LogEntry { time: string; message: string }

interface LiveCounts {
  processedIssues: number; totalIssues: number; failedIssues: number
  processedMembers: number; totalMembers: number
  processedSprints: number; totalSprints: number
  processedComments: number; totalComments: number
  completedPhases: number[]
}

export function ProgressStep({ payload, onComplete }: ProgressStepProps) {
  const [runId, setRunId] = useState<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [activityLog, setActivityLog] = useState<LogEntry[]>([])
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [phaseDurations, setPhaseDurations] = useState<Record<number, { start: number; end?: number }>>({})
  const [liveCounts, setLiveCounts] = useState<LiveCounts>({
    processedIssues: 0, totalIssues: 0, failedIssues: 0,
    processedMembers: 0, totalMembers: 0,
    processedSprints: 0, totalSprints: 0,
    processedComments: 0, totalComments: 0,
    completedPhases: [],
  })
  const logEndRef = useRef<HTMLDivElement>(null)
  const startMutation = useStartMigration()
  const retryMutation = useRetryMigration()
  const completedRef = useRef(false)

  const { data: status } = useMigrationStatus(runId)

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString()
    setActivityLog((prev) => [...prev.slice(-99), { time, message }])
  }, [])

  // Start migration on mount
  useEffect(() => {
    startMutation.mutateAsync(payload).then((res) => {
      setRunId(res.runId)
      addLog('Migration job queued')
    })
  }, []) // eslint-disable-line

  // Socket.io progress events
  useEffect(() => {
    if (!runId) return
    const socket = getSocket()

    function handleProgress(data: {
      runId: string; phase: number; status: string
      completedPhases?: number[]
      counts: Partial<LiveCounts>
    }) {
      if (data.runId !== runId) return

      // Update live counts from socket
      setLiveCounts((prev) => ({
        ...prev,
        ...data.counts,
        completedPhases: data.completedPhases ?? prev.completedPhases,
      }))

      // Track phase start/end times
      setPhaseDurations((prev) => {
        const existing = prev[data.phase]
        if (!existing) return { ...prev, [data.phase]: { start: Date.now() } }
        if ((data.completedPhases ?? []).includes(data.phase) && !existing.end) {
          return { ...prev, [data.phase]: { ...existing, end: Date.now() } }
        }
        return prev
      })

      // Log meaningful events
      const phaseLabel = PHASES.find(p => p.id === data.phase)?.label ?? `Phase ${data.phase}`
      if (data.status === 'completed' && !completedRef.current) {
        completedRef.current = true
        addLog('Migration completed successfully')
        setTimeout(() => onComplete(runId), 800)
      } else if ((data.completedPhases ?? []).includes(data.phase) && data.status !== 'completed') {
        addLog(`${phaseLabel} synced`)
      } else if (data.status === 'processing' && data.phase > 0) {
        addLog(`Syncing ${phaseLabel}...`)
      }
    }

    socket.on('migration:progress', handleProgress)
    return () => { socket.off('migration:progress', handleProgress) }
  }, [runId, addLog, onComplete])

  // Polling fallback for completion
  useEffect(() => {
    if (!status || completedRef.current) return
    if (status.status === 'completed' && runId) {
      completedRef.current = true
      addLog('Migration completed successfully')
      setTimeout(() => onComplete(runId), 800)
    }
    if (status.status === 'failed') {
      addLog('Migration failed — see error details below')
    }
    // Sync poll data into liveCounts
    setLiveCounts((prev) => ({
      ...prev,
      processedIssues: status.processedIssues ?? prev.processedIssues,
      totalIssues: status.totalIssues ?? prev.totalIssues,
      failedIssues: status.failedIssues ?? prev.failedIssues,
      processedMembers: status.processedMembers ?? prev.processedMembers,
      totalMembers: status.totalMembers ?? prev.totalMembers,
      processedSprints: status.processedSprints ?? prev.processedSprints,
      totalSprints: status.totalSprints ?? prev.totalSprints,
      processedComments: status.processedComments ?? prev.processedComments,
      totalComments: status.totalComments ?? prev.totalComments,
    }))
  }, [status, runId, addLog, onComplete])

  // Auto-scroll log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activityLog])

  const statusText = status?.status ?? 'pending'
  const currentPhase = status?.currentPhase ?? 0
  const isFailed = statusText === 'failed'
  const isCompleted = statusText === 'completed'
  const isActive = statusText === 'processing' || statusText === 'pending'
  const completedPhases = liveCounts.completedPhases.length > 0
    ? liveCounts.completedPhases
    : (isCompleted ? [1, 2, 3, 4, 5, 6] : PHASES.filter(p => p.id < currentPhase).map(p => p.id))

  // Overall progress: weight phases equally but use issues as primary signal
  const overallPct = isCompleted ? 100 : (() => {
    const phaseWeight = completedPhases.length / 6 * 100
    const issueBonus = liveCounts.totalIssues > 0
      ? (liveCounts.processedIssues / liveCounts.totalIssues) * (100 / 6)
      : 0
    return Math.min(99, Math.round(phaseWeight + issueBonus))
  })()

  function formatDuration(phase: number): string | null {
    const d = phaseDurations[phase]
    if (!d) return null
    const ms = (d.end ?? Date.now()) - d.start
    const s = Math.round(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.round(s / 60)}m ${s % 60}s`
  }

  function getPhaseProgress(phaseId: number): { processed: number; total: number } {
    switch (phaseId) {
      case 1: return { processed: liveCounts.processedMembers, total: liveCounts.totalMembers }
      case 3: return { processed: liveCounts.processedSprints, total: liveCounts.totalSprints }
      case 4: return { processed: liveCounts.processedIssues, total: liveCounts.totalIssues }
      case 5: return { processed: liveCounts.processedComments, total: liveCounts.totalComments }
      default: return { processed: 0, total: 0 }
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Migration in Progress</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Keep this window open until migration completes.</p>
      </div>

      {/* Overall progress card */}
      <div className={cn(
        'rounded-xl border p-4 space-y-3',
        isCompleted ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
          : isFailed ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
      )}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-gray-900 dark:text-white">Overall Progress</span>
          <div className="flex items-center gap-3">
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              isCompleted ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : isFailed ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
            )}>
              {isCompleted ? 'Complete' : isFailed ? 'Failed' : `${overallPct}%`}
            </span>
          </div>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              isFailed ? 'bg-red-500' : isCompleted ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-blue-600 to-indigo-500',
            )}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Issues', val: liveCounts.processedIssues, total: liveCounts.totalIssues, icon: FileText, color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Members', val: liveCounts.processedMembers, total: liveCounts.totalMembers, icon: Users, color: 'text-violet-600 dark:text-violet-400' },
            { label: 'Sprints', val: liveCounts.processedSprints, total: liveCounts.totalSprints, icon: Zap, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Comments', val: liveCounts.processedComments, total: liveCounts.totalComments, icon: MessageSquare, color: 'text-teal-600 dark:text-teal-400' },
          ].map(({ label, val, total, icon: Icon, color }) => (
            <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
              <Icon className={cn('h-3.5 w-3.5 mx-auto mb-1', color)} />
              <div className="text-sm font-bold text-gray-900 dark:text-white">{val.toLocaleString()}</div>
              {total > 0 && <div className="text-[10px] text-gray-400">of {total.toLocaleString()}</div>}
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {liveCounts.failedIssues > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {liveCounts.failedIssues} issues failed to import
          </div>
        )}
      </div>

      {/* Phase cards */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sync Phases</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {PHASES.map((phase) => {
            const isDone = completedPhases.includes(phase.id) || isCompleted
            const isRunning = currentPhase === phase.id && isActive && !isDone
            const isPending = !isDone && !isRunning
            const { processed, total } = getPhaseProgress(phase.id)
            const pct = total > 0 ? Math.round((processed / total) * 100) : (isDone ? 100 : 0)
            const duration = formatDuration(phase.id)
            const Icon = phase.icon

            return (
              <div key={phase.id} className={cn(
                'px-4 py-3 transition-colors',
                isRunning ? phase.bgColor : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30',
              )}>
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    isDone ? 'bg-green-100 dark:bg-green-900/30'
                      : isRunning ? phase.bgColor
                      : 'bg-gray-100 dark:bg-gray-800',
                  )}>
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : isRunning ? (
                      <Loader2 className={cn('h-4 w-4 animate-spin', phase.color)} />
                    ) : (
                      <Icon className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                    )}
                  </div>

                  {/* Label + progress */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        'text-sm font-medium',
                        isDone ? 'text-gray-900 dark:text-white'
                          : isRunning ? phase.color.split(' ')[0]
                          : 'text-gray-400 dark:text-gray-500',
                      )}>
                        {phase.label}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isRunning && total > 0 && (
                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                            {processed.toLocaleString()} / {total.toLocaleString()}
                          </span>
                        )}
                        {isDone && duration && (
                          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                            <Clock className="h-3 w-3" />{duration}
                          </span>
                        )}
                        {isDone && !duration && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Done</span>
                        )}
                        {isRunning && (
                          <span className={cn('text-xs font-medium', phase.color.split(' ')[0])}>
                            {total > 0 ? `${pct}%` : 'Running...'}
                          </span>
                        )}
                        {isPending && (
                          <span className="text-xs text-gray-300 dark:text-gray-600">Pending</span>
                        )}
                      </div>
                    </div>
                    {/* Progress bar (only when running or done with counts) */}
                    {(isRunning || (isDone && total > 0)) && (
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isDone ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500',
                          )}
                          style={{ width: `${isDone ? 100 : pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Projects list (collapsible) */}
      {payload.projectKeys.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <button
            onClick={() => setProjectsExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Projects ({payload.projectKeys.length})
              </span>
            </div>
            {projectsExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {projectsExpanded && (
            <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
              {payload.projectKeys.map((key) => (
                <div key={key} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[11px] font-mono font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800 flex-shrink-0">
                    {key}
                  </span>
                  <span className="flex-1 text-sm text-gray-600 dark:text-gray-300 truncate">{key}</span>
                  {(completedPhases.includes(4) || isCompleted) && (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  )}
                  {currentPhase === 4 && isActive && (
                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity log */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activity Log</h3>
        </div>
        <div className="p-3 h-36 overflow-y-auto bg-gray-950 dark:bg-gray-950 font-mono text-xs space-y-1 rounded-b-xl">
          {activityLog.length === 0 ? (
            <p className="text-gray-600">Waiting for activity...</p>
          ) : activityLog.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-gray-600 flex-shrink-0">{entry.time}</span>
              <span className={cn(
                entry.message.startsWith('Migration completed') ? 'text-green-400'
                  : entry.message.startsWith('Migration failed') ? 'text-red-400'
                  : entry.message.includes('synced') ? 'text-green-400'
                  : 'text-gray-300',
              )}>{entry.message}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Failed state */}
      {isFailed && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex gap-3">
            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Migration failed</p>
              <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
                Completed phases will be skipped on retry.
              </p>
              <Button
                onClick={async () => {
                  if (runId) {
                    addLog('Retrying...')
                    await retryMutation.mutateAsync(runId)
                    addLog('Re-queued')
                  }
                }}
                disabled={retryMutation.isPending}
                size="sm"
                className="mt-3 bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                {retryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Retry Migration
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel button */}
      {!isCompleted && !isFailed && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => setCancelDialogOpen(true)}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800"
          >
            Cancel Migration
          </Button>
        </div>
      )}

      {/* Cancel dialog */}
      {cancelDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cancel Migration?</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Completed phases are preserved. You can retry from the migration history page.
            </p>
            <div className="mt-5 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Keep Running</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setCancelDialogOpen(false)}>
                Cancel Migration
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
