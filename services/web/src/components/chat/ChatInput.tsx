import { useState, useRef, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/store/chat.store'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (content: string) => void
  showSuggestions?: boolean
  disabled?: boolean
}

const SUGGESTED_PROMPTS = [
  'What is the current sprint status?',
  'Are there any blockers?',
  'What was recently completed?',
  'Who has the most work assigned?',
]

export function ChatInput({ onSend, showSuggestions, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isStreaming } = useChatStore()

  const isDisabled = isStreaming || disabled

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isDisabled) return
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
    <div className="border-t border-gray-200 dark:border-gray-700 p-3 shrink-0">
      {showSuggestions && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSend(prompt)}
              disabled={isDisabled}
              className="text-xs px-2.5 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={disabled ? 'AI budget exhausted for today' : 'Ask about issues, sprints, docs...'}
          disabled={isDisabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            'disabled:opacity-50',
          )}
        />
        <Button
          size="icon-sm"
          onClick={handleSend}
          disabled={!value.trim() || isDisabled}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
