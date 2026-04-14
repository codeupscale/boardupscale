import { Sparkles, TrendingUp, TrendingDown, Users, Lightbulb, Loader2 } from 'lucide-react'
import { useAiStatus, useSprintInsights } from '@/hooks/useAi'
import { cn } from '@/lib/utils'

interface SprintIntelligenceWidgetProps {
  sprintId?: string
  className?: string
}

export function SprintIntelligenceWidget({ sprintId, className }: SprintIntelligenceWidgetProps) {
  const { data: status } = useAiStatus()
  const { data: insights, isLoading } = useSprintInsights(sprintId)

  // Don't render if AI is disabled
  if (!status?.enabled) return null

  if (!sprintId) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-foreground">Sprint Intelligence</h3>
        </div>
        <p className="text-xs text-muted-foreground">No active sprint. Start a sprint to see AI insights.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
          <span className="text-xs text-purple-500">Analyzing sprint...</span>
        </div>
      </div>
    )
  }

  if (!insights) return null

  const { completionPrediction, workloadBalance, suggestions } = insights
  const maxPoints = Math.max(...workloadBalance.map((w) => w.assignedPoints), 1)

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <h3 className="text-sm font-semibold text-foreground">Sprint Intelligence</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{insights.sprintName}</span>
      </div>

      {/* Completion Gauge */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-muted"
              strokeDasharray="100, 100"
              d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className={completionPrediction.onTrack ? 'text-green-500' : 'text-amber-500'}
              strokeDasharray={`${completionPrediction.percentage}, 100`}
              d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground/80">
            {completionPrediction.percentage}%
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            {completionPrediction.onTrack ? (
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
            )}
            <span className={cn('text-xs font-semibold', completionPrediction.onTrack ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
              {completionPrediction.onTrack ? 'On Track' : 'At Risk'}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {completionPrediction.percentage}% complete
          </p>
        </div>
      </div>

      {/* Workload Balance */}
      {workloadBalance.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Workload
            </span>
          </div>
          <div className="space-y-1.5">
            {workloadBalance.slice(0, 5).map((w) => (
              <div key={w.userId} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-20 truncate">
                  {w.displayName}
                </span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all bg-purple-400 dark:bg-purple-500"
                    style={{ width: `${(w.assignedPoints / maxPoints) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-8 text-right">
                  {w.assignedPoints} SP
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">
              Suggestions
            </span>
          </div>
          <ul className="space-y-1">
            {suggestions.map((s, idx) => (
              <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-purple-400 mt-0.5 flex-shrink-0">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
