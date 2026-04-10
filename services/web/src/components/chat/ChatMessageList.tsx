import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowDown } from 'lucide-react'
import { ChatMessageBubble } from './ChatMessageBubble'
import { UpsyAvatar } from './UpsyAvatar'
import { useChatStore } from '@/store/chat.store'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'

interface ChatMessageListProps {
  messages: ChatMessage[]
  userName?: string
  userAvatar?: string
}

export function ChatMessageList({ messages, userName, userAvatar }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { isStreaming, streamingContent } = useChatStore()
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  // Auto-scroll on new messages / stream chunks
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Only auto-scroll if user is near the bottom (within 120px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNearBottom) {
      scrollToBottom()
    }
  }, [messages, streamingContent, scrollToBottom])

  // Show/hide scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(gap > 200)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto relative" role="log" aria-live="polite">
      {/* Empty state */}
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-5">
          <div className="relative">
            <div className="absolute -inset-3 bg-indigo-100/40 dark:bg-indigo-900/20 rounded-full blur-xl" />
            <div className="relative">
              <UpsyAvatar size={64} />
              <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-green-400 rounded-full border-[2.5px] border-white dark:border-gray-900" />
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="text-[15px] font-semibold text-gray-800 dark:text-gray-100">
              Hi{userName ? `, ${userName.split(' ')[0]}` : ''}!
            </h4>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed max-w-[280px]">
              I'm <span className="font-medium text-indigo-500">Upsy</span>, your project assistant. Ask me about sprints, issues, team workload, blockers, or anything about this project.
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="py-3 space-y-1">
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            userName={userName}
            userAvatar={userAvatar}
          />
        ))}

        {/* Streaming response */}
        {isStreaming && streamingContent && (
          <ChatMessageBubble
            message={{ role: 'assistant', content: streamingContent }}
            isStreaming
          />
        )}

        {/* Thinking indicator */}
        {isStreaming && !streamingContent && (
          <div className="px-4 py-1.5">
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 mt-1">
                <UpsyAvatar size={28} />
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl rounded-tl-md px-4 py-3 border border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Thinking...
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => scrollToBottom()}
          className={cn(
            'absolute bottom-3 left-1/2 -translate-x-1/2 z-10',
            'flex items-center gap-1 px-3 py-1.5 rounded-full',
            'bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700',
            'text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            'transition-all duration-200 hover:shadow-xl',
          )}
        >
          <ArrowDown className="h-3 w-3" />
          <span>New messages</span>
        </button>
      )}
    </div>
  )
}
