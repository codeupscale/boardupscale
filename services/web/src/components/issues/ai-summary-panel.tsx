import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useAiStatus, useAiSummary, IssueSummary } from '@/hooks/useAi'
import { cn } from '@/lib/utils'

interface AiSummaryPanelProps {
  issueId: string
  className?: string
}

export function AiSummaryPanel({ issueId, className }: AiSummaryPanelProps) {
  const { data: status } = useAiStatus()
  const [expanded, setExpanded] = useState(false)
  const [summary, setSummary] = useState<IssueSummary | null>(null)
  const { mutate: fetchSummary, isPending } = useAiSummary(issueId)

  // Don't render if AI is disabled
  if (!status?.enabled) return null

  const handleToggle = () => {
    if (!expanded && !summary) {
      // Fetch summary on first expand
      fetchSummary(undefined, {
        onSuccess: (data) => {
          setSummary(data)
        },
      })
    }
    setExpanded(!expanded)
  }

  return (
    <div className={cn('rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10', className)}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-purple-50/50 dark:hover:bg-purple-800/20 transition-colors rounded-lg"
      >
        <Sparkles className="h-4 w-4 text-purple-500 dark:text-purple-400 flex-shrink-0" />
        <span className="text-sm font-medium text-purple-700 dark:text-purple-300 flex-1">
          AI Summary
        </span>
        {isPending ? (
          <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
        ) : expanded ? (
          <ChevronDown className="h-4 w-4 text-purple-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-purple-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {isPending && !summary && (
            <div className="text-xs text-purple-500 dark:text-purple-400 animate-pulse">
              Generating summary...
            </div>
          )}

          {summary && (
            <>
              <div>
                <p className="text-sm text-foreground leading-relaxed">
                  {summary.summary}
                </p>
              </div>

              {summary.keyDecisions.length > 0 && (
                <SummarySection title="Key Decisions" items={summary.keyDecisions} />
              )}

              {summary.blockers.length > 0 && (
                <SummarySection title="Blockers" items={summary.blockers} variant="warning" />
              )}

              {summary.nextSteps.length > 0 && (
                <SummarySection title="Next Steps" items={summary.nextSteps} variant="success" />
              )}

              <div className="text-[10px] text-muted-foreground pt-1">
                Generated {new Date(summary.generatedAt).toLocaleString()}
              </div>
            </>
          )}

          {!isPending && !summary && (
            <div className="text-xs text-muted-foreground">
              Unable to generate summary. Try again later.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummarySection({
  title,
  items,
  variant = 'default',
}: {
  title: string
  items: string[]
  variant?: 'default' | 'warning' | 'success'
}) {
  const colorMap = {
    default: 'text-purple-600 dark:text-purple-400',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-green-600 dark:text-green-400',
  }

  return (
    <div>
      <h4 className={cn('text-[10px] uppercase tracking-wider font-semibold mb-1', colorMap[variant])}>
        {title}
      </h4>
      <ul className="space-y-0.5">
        {items.map((item, idx) => (
          <li key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
            <span className="text-purple-400 mt-0.5">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
