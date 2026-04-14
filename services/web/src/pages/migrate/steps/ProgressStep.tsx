import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Loader2, XCircle, AlertTriangle,
  RefreshCw, Users, FolderOpen,
  Zap, FileText, MessageSquare, Paperclip, Clock, TrendingUp,
  Cpu, HardDrive, Database, Activity, Timer, Gauge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useStartMigration, useMigrationStatus, useRetryMigration, useCancelMigration,
  useMigrationMetrics, StartMigrationPayload, SystemMetrics,
} from '@/hooks/useMigration'
import { getSocket } from '@/lib/socket'

interface ProgressStepProps {
  payload: StartMigrationPayload
  onComplete: (runId: string) => void
  initialRunId?: string
  onReset?: () => void
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
  { id: 2, label: 'Projects',    icon: FolderOpen,     color: 'text-primary',      bgColor: 'bg-primary/10'      },
  { id: 3, label: 'Sprints',     icon: Zap,            color: 'text-amber-600 dark:text-amber-400',    bgColor: 'bg-amber-50 dark:bg-amber-900/20'    },
  { id: 4, label: 'Issues',      icon: FileText,       color: 'text-indigo-600 dark:text-indigo-400',  bgColor: 'bg-indigo-50 dark:bg-indigo-900/20'  },
  { id: 5, label: 'Comments',    icon: MessageSquare,  color: 'text-teal-600 dark:text-teal-400',      bgColor: 'bg-teal-50 dark:bg-teal-900/20'      },
  { id: 6, label: 'Attachments', icon: Paperclip,      color: 'text-muted-foreground',      bgColor: 'bg-muted'         },
]

interface LogEntry { time: string; message: string }

interface LiveCounts {
  processedIssues: number; totalIssues: number; failedIssues: number
  processedProjects: number; totalProjects: number
  processedMembers: number; totalMembers: number
  processedSprints: number; totalSprints: number
  processedComments: number; totalComments: number
  completedPhases: number[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(0)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function formatEta(minutes: number): string {
  if (minutes <= 0) return 'Calculating...'
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `~${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `~${h}h ${m}m`
}

// ── Gauge Ring (SVG circular progress) ──────────────────────────────────

function GaugeRing({ value, max = 100, size = 48, strokeWidth = 4, color, children }: {
  value: number; max?: number; size?: number; strokeWidth?: number; color: string; children?: React.ReactNode
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(value / max, 1)
  const offset = circumference * (1 - pct)
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" className="stroke-muted" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

// ── System Utilization Panel ────────────────────────────────────────────

function SystemPanel({ metrics, isActive }: { metrics: SystemMetrics | undefined; isActive: boolean }) {
  if (!metrics || !isActive) return null

  const cpuColor = metrics.system.cpuUsagePercent > 80 ? '#ef4444' : metrics.system.cpuUsagePercent > 50 ? '#f59e0b' : '#22c55e'
  const memColor = metrics.system.memoryUsagePercent > 85 ? '#ef4444' : metrics.system.memoryUsagePercent > 60 ? '#f59e0b' : '#22c55e'
  const heapPct = Math.round((metrics.process.heapUsed / metrics.process.heapTotal) * 100)
  const heapColor = heapPct > 85 ? '#ef4444' : heapPct > 60 ? '#f59e0b' : '#3b82f6'

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">System Utilization</h3>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      </div>
      <div className="p-4">
        {/* Gauges row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* CPU */}
          <div className="flex flex-col items-center gap-2">
            <GaugeRing value={metrics.system.cpuUsagePercent} color={cpuColor} size={56} strokeWidth={5}>
              <span className="text-xs font-bold text-foreground">{metrics.system.cpuUsagePercent}%</span>
            </GaugeRing>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">CPU</p>
              <p className="text-[10px] text-muted-foreground">{metrics.system.cpuCores} cores</p>
            </div>
          </div>
          {/* Memory */}
          <div className="flex flex-col items-center gap-2">
            <GaugeRing value={metrics.system.memoryUsagePercent} color={memColor} size={56} strokeWidth={5}>
              <span className="text-xs font-bold text-foreground">{metrics.system.memoryUsagePercent}%</span>
            </GaugeRing>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">Memory</p>
              <p className="text-[10px] text-muted-foreground">
                {formatBytes(metrics.system.memoryUsed)} / {formatBytes(metrics.system.memoryTotal)}
              </p>
            </div>
          </div>
          {/* Heap */}
          <div className="flex flex-col items-center gap-2">
            <GaugeRing value={heapPct} color={heapColor} size={56} strokeWidth={5}>
              <span className="text-xs font-bold text-foreground">{heapPct}%</span>
            </GaugeRing>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">Heap</p>
              <p className="text-[10px] text-muted-foreground">
                {formatBytes(metrics.process.heapUsed)} / {formatBytes(metrics.process.heapTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Cpu className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">
              {metrics.system.loadAverage[0].toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground">Load (1m)</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <HardDrive className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">
              {formatBytes(metrics.process.rss)}
            </p>
            <p className="text-[10px] text-muted-foreground">Process RSS</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Database className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">
              {metrics.database.active}/{metrics.database.total}
            </p>
            <p className="text-[10px] text-muted-foreground">DB Conns</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Activity className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">
              {metrics.queue.active} / {metrics.queue.waiting}
            </p>
            <p className="text-[10px] text-muted-foreground">Queue Act/Wait</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Throughput & ETA Panel ──────────────────────────────────────────────

function ThroughputPanel({ metrics, liveCounts, isActive }: {
  metrics: SystemMetrics | undefined; liveCounts: LiveCounts; isActive: boolean
}) {
  if (!metrics || !isActive) return null

  const { throughput } = metrics
  const totalProcessed = liveCounts.processedIssues + liveCounts.processedComments +
    liveCounts.processedMembers + liveCounts.processedSprints + liveCounts.processedProjects

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Throughput & ETA</h3>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Elapsed */}
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <Timer className="h-4 w-4 mx-auto mb-1.5 text-blue-500" />
            <p className="text-sm font-bold text-foreground">
              {formatDurationShort(throughput.elapsedSeconds)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Elapsed</p>
          </div>
          {/* ETA */}
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <Clock className="h-4 w-4 mx-auto mb-1.5 text-amber-500" />
            <p className="text-sm font-bold text-foreground">
              {formatEta(throughput.etaMinutes)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Remaining</p>
          </div>
          {/* Issues/min */}
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <TrendingUp className="h-4 w-4 mx-auto mb-1.5 text-indigo-500" />
            <p className="text-sm font-bold text-foreground">
              {throughput.issuesPerMin > 0 ? `${throughput.issuesPerMin}/min` : '--'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Issue Rate</p>
          </div>
          {/* Total processed */}
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <Zap className="h-4 w-4 mx-auto mb-1.5 text-green-500" />
            <p className="text-sm font-bold text-foreground">
              {totalProcessed.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Total Synced</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────

export function ProgressStep({ payload, onComplete, initialRunId, onReset }: ProgressStepProps) {
  const [runId, setRunId] = useState<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [activityLog, setActivityLog] = useState<LogEntry[]>([])
  const [phaseDurations, setPhaseDurations] = useState<Record<number, { start: number; end?: number }>>({})
  const [liveCounts, setLiveCounts] = useState<LiveCounts>({
    processedIssues: 0, totalIssues: 0, failedIssues: 0,
    processedProjects: 0, totalProjects: 0,
    processedMembers: 0, totalMembers: 0,
    processedSprints: 0, totalSprints: 0,
    processedComments: 0, totalComments: 0,
    completedPhases: [],
  })
  const logEndRef = useRef<HTMLDivElement>(null)
  const startMutation = useStartMigration()
  const retryMutation = useRetryMigration()
  const cancelMutation = useCancelMigration()
  const completedRef = useRef(false)
  const queryClient = useQueryClient()

  const { data: status, error: statusError } = useMigrationStatus(runId)
  const { data: metrics } = useMigrationMetrics(runId)

  // ── 404 guard: run was deleted → reset wizard ────
  useEffect(() => {
    const err = statusError as any
    if (err?.response?.status === 404 && onReset) {
      sessionStorage.removeItem('boardupscale_active_migration')
      onReset()
    }
  }, [statusError, onReset])

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString()
    setActivityLog((prev) => [...prev.slice(-99), { time, message }])
  }, [])

  // Start migration on mount (or reconnect to existing run)
  useEffect(() => {
    if (initialRunId) {
      setRunId(initialRunId)
      addLog('Reconnected to running migration')
      return
    }
    startMutation.mutateAsync(payload).then((res) => {
      setRunId(res.runId)
      addLog('Migration job queued')
    })
  }, []) // eslint-disable-line

  // Socket.io progress events
  useEffect(() => {
    if (!runId) return
    const socket = getSocket()

    function handleConnect() {
      queryClient.invalidateQueries({ queryKey: ['migration-status', runId] })
    }
    socket.on('connect', handleConnect)

    function handleProgress(data: {
      runId: string; phase: number; status: string
      completedPhases?: number[]
      counts: Partial<LiveCounts>
    }) {
      if (data.runId !== runId) return

      setLiveCounts((prev) => ({
        ...prev,
        ...data.counts,
        completedPhases: data.completedPhases ?? prev.completedPhases,
      }))

      setPhaseDurations((prev) => {
        const existing = prev[data.phase]
        if (!existing) return { ...prev, [data.phase]: { start: Date.now() } }
        if ((data.completedPhases ?? []).includes(data.phase) && !existing.end) {
          return { ...prev, [data.phase]: { ...existing, end: Date.now() } }
        }
        return prev
      })

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
    return () => {
      socket.off('connect', handleConnect)
      socket.off('migration:progress', handleProgress)
    }
  }, [runId, addLog, onComplete, queryClient])

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
    setLiveCounts((prev) => ({
      ...prev,
      processedIssues: status.processedIssues ?? prev.processedIssues,
      totalIssues: status.totalIssues ?? prev.totalIssues,
      failedIssues: status.failedIssues ?? prev.failedIssues,
      processedProjects: status.processedProjects ?? prev.processedProjects,
      totalProjects: status.totalProjects ?? prev.totalProjects,
      processedMembers: status.processedMembers ?? prev.processedMembers,
      totalMembers: status.totalMembers ?? prev.totalMembers,
      processedSprints: status.processedSprints ?? prev.processedSprints,
      totalSprints: status.totalSprints ?? prev.totalSprints,
      processedComments: status.processedComments ?? prev.processedComments,
      totalComments: status.totalComments ?? prev.totalComments,
      completedPhases: status.completedPhases?.length ? status.completedPhases : prev.completedPhases,
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

  const overallPct = isCompleted ? 100 : (() => {
    const phaseWeight = completedPhases.length / 6 * 100
    const issueBonus = liveCounts.totalIssues > 0
      ? (liveCounts.processedIssues / liveCounts.totalIssues) * (100 / 6)
      : 0
    return Math.min(99, Math.round(phaseWeight + issueBonus))
  })()

  function formatPhaseDuration(phase: number): string | null {
    const d = phaseDurations[phase]
    if (!d) return null
    const ms = (d.end ?? Date.now()) - d.start
    const s = Math.round(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.round(s / 60)}m ${s % 60}s`
  }

  function getPhaseProgress(phaseId: number): { processed: number; total: number } {
    switch (phaseId) {
      case 1: return { processed: liveCounts.processedMembers, total: liveCounts.totalMembers }
      case 2: return { processed: liveCounts.processedProjects, total: liveCounts.totalProjects }
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
        <h2 className="text-xl font-bold text-foreground">Migration in Progress</h2>
        <p className="mt-1 text-sm text-muted-foreground">Keep this window open until migration completes.</p>
      </div>

      {/* Overall progress card */}
      <div className={cn(
        'rounded-xl border p-4 space-y-3',
        isCompleted ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
          : isFailed ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
          : 'bg-card border-border',
      )}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-foreground">Overall Progress</span>
          <div className="flex items-center gap-3">
            {/* ETA badge */}
            {isActive && metrics?.throughput.etaMinutes != null && metrics.throughput.etaMinutes > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatEta(metrics.throughput.etaMinutes)} left
              </span>
            )}
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              isCompleted ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : isFailed ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-primary/10 text-primary dark:text-primary',
            )}>
              {isCompleted ? 'Complete' : isFailed ? 'Failed' : `${overallPct}%`}
            </span>
          </div>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              isFailed ? 'bg-red-500' : isCompleted ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-blue-600 to-indigo-500',
            )}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: 'Projects', val: liveCounts.processedProjects, total: liveCounts.totalProjects, icon: FolderOpen, color: 'text-primary' },
            { label: 'Issues', val: liveCounts.processedIssues, total: liveCounts.totalIssues, icon: FileText, color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Members', val: liveCounts.processedMembers, total: liveCounts.totalMembers, icon: Users, color: 'text-violet-600 dark:text-violet-400' },
            { label: 'Sprints', val: liveCounts.processedSprints, total: liveCounts.totalSprints, icon: Zap, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Comments', val: liveCounts.processedComments, total: liveCounts.totalComments, icon: MessageSquare, color: 'text-teal-600 dark:text-teal-400' },
          ].map(({ label, val, total, icon: Icon, color }) => (
            <div key={label} className="bg-muted/50 rounded-lg p-2 text-center">
              <Icon className={cn('h-3.5 w-3.5 mx-auto mb-1', color)} />
              <div className="text-sm font-bold text-foreground">{val.toLocaleString()}</div>
              {total > 0 && <div className="text-[10px] text-muted-foreground">of {total.toLocaleString()}</div>}
              <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
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

      {/* Throughput & ETA + System Utilization — side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ThroughputPanel metrics={metrics} liveCounts={liveCounts} isActive={isActive} />
        <SystemPanel metrics={metrics} isActive={isActive} />
      </div>

      {/* Phase cards */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Sync Phases</h3>
        </div>
        <div className="divide-y divide-border">
          {PHASES.map((phase) => {
            const isDone = completedPhases.includes(phase.id) || isCompleted
            const isRunning = currentPhase === phase.id && isActive && !isDone
            const isPending = !isDone && !isRunning
            const { processed, total } = getPhaseProgress(phase.id)
            const pct = total > 0 ? Math.round((processed / total) * 100) : (isDone ? 100 : 0)
            const duration = formatPhaseDuration(phase.id)
            const Icon = phase.icon

            return (
              <div key={phase.id} className={cn(
                'px-4 py-3 transition-colors',
                isRunning ? phase.bgColor : 'hover:bg-accent/30',
              )}>
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    isDone ? 'bg-green-100 dark:bg-green-900/30'
                      : isRunning ? phase.bgColor
                      : 'bg-muted',
                  )}>
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : isRunning ? (
                      <Loader2 className={cn('h-4 w-4 animate-spin', phase.color)} />
                    ) : (
                      <Icon className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>

                  {/* Label + progress */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        'text-sm font-medium',
                        isDone ? 'text-foreground'
                          : isRunning ? phase.color.split(' ')[0]
                          : 'text-muted-foreground',
                      )}>
                        {phase.label}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isRunning && total > 0 && (
                          <span className="text-xs font-mono text-muted-foreground">
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
                          <span className="text-xs text-muted-foreground/60">Pending</span>
                        )}
                      </div>
                    </div>
                    {(isRunning || (isDone && total > 0)) && (
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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

      {/* Activity log */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Activity Log</h3>
        </div>
        <div className="p-3 h-36 overflow-y-auto bg-foreground/95 font-mono text-xs space-y-1 rounded-b-xl">
          {activityLog.length === 0 ? (
            <p className="text-muted-foreground">Waiting for activity...</p>
          ) : activityLog.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground flex-shrink-0">{entry.time}</span>
              <span className={cn(
                entry.message.startsWith('Migration completed') ? 'text-green-400'
                  : entry.message.startsWith('Migration failed') ? 'text-red-400'
                  : entry.message.includes('synced') ? 'text-green-400'
                  : 'text-muted-foreground/50',
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
                className="mt-3 bg-red-600 hover:bg-red-700 text-white gap-2 h-8 px-3 text-sm"
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
            onClick={() => setCancelDialogOpen(true)}
            className="border border-red-200 bg-transparent text-red-600 hover:bg-red-50 dark:text-red-400 dark:border-red-800"
          >
            Cancel Migration
          </Button>
        </div>
      )}

      {/* Cancel dialog */}
      {cancelDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-border">
            <h3 className="text-lg font-bold text-foreground">Cancel Migration?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Completed phases are preserved. You can retry from the migration history page.
            </p>
            <div className="mt-5 flex gap-3 justify-end">
              <Button onClick={() => setCancelDialogOpen(false)} className="border border-border bg-transparent hover:bg-accent">Keep Running</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={cancelMutation.isPending}
                onClick={async () => {
                  if (!runId) return
                  await cancelMutation.mutateAsync(runId)
                  setCancelDialogOpen(false)
                  sessionStorage.removeItem('boardupscale_active_migration')
                  window.location.href = '/settings/migrate/jira'
                }}
              >
                {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : null}
                Cancel Migration
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
