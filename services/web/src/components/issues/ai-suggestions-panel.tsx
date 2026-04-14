import { Sparkles, Check, User, ArrowRight } from 'lucide-react'
import { useAiStatus, useAiSuggestions, FieldSuggestions } from '@/hooks/useAi'
import { cn } from '@/lib/utils'

interface AiSuggestionsPanelProps {
  title: string
  description?: string
  projectId?: string
  onApplyType?: (type: string) => void
  onApplyPriority?: (priority: string) => void
  onApplyTitle?: (title: string) => void
  onApplyAssignee?: (userId: string) => void
  className?: string
}

export function AiSuggestionsPanel({
  title,
  description,
  projectId,
  onApplyType,
  onApplyPriority,
  onApplyTitle,
  onApplyAssignee,
  className,
}: AiSuggestionsPanelProps) {
  const { data: status } = useAiStatus()
  const { data: suggestions, isLoading } = useAiSuggestions(title, description, projectId)

  // Don't render if AI is disabled or no suggestions
  if (!status?.enabled) return null

  if (isLoading && title.length >= 10) {
    return (
      <div className={cn('rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-3', className)}>
        <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          <span>AI is analyzing your issue...</span>
        </div>
      </div>
    )
  }

  if (!suggestions || (!suggestions.type && !suggestions.priority && !suggestions.title)) return null

  return (
    <div className={cn('rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">
          AI Suggestions
        </span>
      </div>

      <div className="space-y-2">
        {suggestions.type && (
          <SuggestionRow
            label="Type"
            value={suggestions.type}
            onApply={() => onApplyType?.(suggestions.type!)}
          />
        )}

        {suggestions.priority && (
          <SuggestionRow
            label="Priority"
            value={suggestions.priority}
            onApply={() => onApplyPriority?.(suggestions.priority!)}
          />
        )}

        {suggestions.title && (
          <SuggestionRow
            label="Better title"
            value={suggestions.title}
            onApply={() => onApplyTitle?.(suggestions.title!)}
          />
        )}

        {suggestions.assignees && suggestions.assignees.length > 0 && (
          <div className="pt-1 border-t border-purple-200/50 dark:border-purple-700/50">
            <span className="text-[10px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-medium">
              Suggested Assignees
            </span>
            <div className="mt-1 space-y-1">
              {suggestions.assignees.map((a) => (
                <button
                  key={a.userId}
                  type="button"
                  onClick={() => onApplyAssignee?.(a.userId)}
                  className="flex items-center gap-2 w-full px-2 py-1 rounded text-left hover:bg-purple-100 dark:hover:bg-purple-800/30 transition-colors"
                >
                  <User className="h-3 w-3 text-purple-400" />
                  <span className="text-xs text-foreground font-medium">
                    {a.displayName}
                  </span>
                  <span className="text-[10px] text-purple-500 dark:text-purple-400 ml-auto">
                    {a.reason}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SuggestionRow({
  label,
  value,
  onApply,
}: {
  label: string
  value: string
  onApply: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-medium w-16 flex-shrink-0">
        {label}
      </span>
      <span className="text-xs text-foreground flex-1 truncate">
        {value}
      </span>
      <button
        type="button"
        onClick={onApply}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-800/40 hover:bg-purple-200 dark:hover:bg-purple-700/40 transition-colors"
      >
        <Check className="h-3 w-3" />
        Apply
      </button>
    </div>
  )
}
