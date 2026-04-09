import { useState, useRef, KeyboardEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { useChatStore } from '@/store/chat.store'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (content: string) => void
  showSuggestions?: boolean
  disabled?: boolean
}

const SUGGESTED_PROMPTS = [
  { icon: '📊', text: 'Sprint status' },
  { icon: '🚧', text: 'Any blockers?' },
  { icon: '👥', text: 'Team workload' },
  { icon: '✅', text: 'Recently completed' },
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
    <div className="border-t border-gray-100 dark:border-gray-800 p-3 shrink-0">
      {showSuggestions && (
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt.text}
              onClick={() => onSend(prompt.text)}
              disabled={isDisabled}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-left transition-all duration-150',
                'border border-gray-200 dark:border-gray-700',
                'text-gray-600 dark:text-gray-400',
                'hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700',
                'dark:hover:bg-indigo-900/20 dark:hover:border-indigo-700 dark:hover:text-indigo-300',
                'disabled:opacity-50 disabled:hover:bg-transparent',
              )}
            >
              <span>{prompt.icon}</span>
              <span>{prompt.text}</span>
            </button>
          ))}
        </div>
      )}
      <div className="relative">
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
            'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700',
            'bg-gray-50 dark:bg-gray-800/50 pl-4 pr-12 py-3 text-sm',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            'focus:bg-white dark:focus:bg-gray-800',
            'disabled:opacity-50',
            'transition-all duration-150',
          )}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || isDisabled}
          aria-label="Send message"
          className={cn(
            'absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150',
            value.trim() && !isDisabled
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-1.5">
        Upsy can make mistakes. Verify important info.
      </p>
    </div>
  )
}
