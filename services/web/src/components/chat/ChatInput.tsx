import { useState, useRef, KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { useChatStore } from '@/store/chat.store'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (content: string) => void
  showSuggestions?: boolean
  disabled?: boolean
}

const SUGGESTED_PROMPTS = [
  { icon: '📊', label: 'Sprint progress', text: 'What is the current sprint status? Show me the progress breakdown by status and assignee.' },
  { icon: '🚧', label: 'Find blockers', text: 'Are there any blocked or stalled issues? List them with their assignees.' },
  { icon: '👥', label: 'Team workload', text: 'Show me the workload distribution across team members in the current sprint.' },
  { icon: '✅', label: 'Completed work', text: 'What issues were recently completed? Group them by sprint.' },
]

export function ChatInput({ onSend, showSuggestions, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isStreaming, cancelStream } = useChatStore()

  const isDisabled = disabled
  const canSend = value.trim() && !isDisabled && !isStreaming

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isDisabled || isStreaming) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }

  return (
    <div className="shrink-0 border-t border-gray-100 dark:border-gray-800">
      {/* Suggestion chips */}
      {showSuggestions && (
        <div className="px-4 pt-3 pb-1">
          <div className="grid grid-cols-2 gap-1.5">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                onClick={() => onSend(prompt.text)}
                disabled={isDisabled || isStreaming}
                className={cn(
                  'flex items-center gap-2 text-[11px] px-3 py-2 rounded-xl text-left transition-all duration-150',
                  'bg-gray-50 dark:bg-gray-800/60',
                  'border border-gray-150 dark:border-gray-700/80',
                  'text-gray-600 dark:text-gray-400',
                  'hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 hover:shadow-sm',
                  'dark:hover:bg-indigo-900/20 dark:hover:border-indigo-700 dark:hover:text-indigo-300',
                  'disabled:opacity-40 disabled:pointer-events-none',
                )}
              >
                <span className="text-sm">{prompt.icon}</span>
                <span className="font-medium">{prompt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="p-3">
        <div className="relative flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? 'AI budget exhausted for today' : 'Ask Upsy anything...'}
            disabled={isDisabled}
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-xl',
              'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700',
              'pl-4 pr-4 py-2.5 text-[13px]',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500',
              'text-gray-800 dark:text-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400',
              'focus:bg-card',
              'disabled:opacity-40',
              'transition-all duration-150',
            )}
          />
          {isStreaming ? (
            <button
              onClick={cancelStream}
              aria-label="Stop generating"
              title="Stop generating"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-150',
                'bg-red-500 hover:bg-red-600 text-white shadow-sm',
              )}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-150',
                canSend
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600',
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-400/70 dark:text-gray-600 text-center mt-2 select-none">
          Upsy can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  )
}
