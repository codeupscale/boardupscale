import { useState, useRef, useCallback, useEffect } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSocket } from '@/lib/socket'

interface MessageInputProps {
  channelId: string
  onSend: (content: string) => void
  disabled?: boolean
  typingUsers?: string[]
}

export function MessageInput({ channelId, onSend, disabled, typingUsers = [] }: MessageInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const emitTyping = useCallback(() => {
    const socket = getSocket()
    socket.emit('chat:typing', { channelId })
  }, [channelId])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Emit typing indicator (debounced)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    emitTyping()
    typingTimeoutRef.current = setTimeout(() => {
      // Stop emitting after 2s of inactivity
    }, 2000)
  }

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [value])

  return (
    <div className="border-t border-border p-3 shrink-0">
      {typingUsers.length > 0 && (
        <div className="text-xs text-muted-foreground mb-1.5 px-1 animate-pulse">
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'max-h-[120px]',
          )}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className={cn(
            'flex items-center justify-center rounded-lg p-2 transition-colors',
            'text-primary-foreground bg-primary hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'shrink-0',
          )}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
