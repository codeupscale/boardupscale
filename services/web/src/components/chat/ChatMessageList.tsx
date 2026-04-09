import { useEffect, useRef } from 'react'
import { ChatMessageBubble } from './ChatMessageBubble'
import { UpsyAvatar } from './UpsyAvatar'
import { useChatStore } from '@/store/chat.store'
import type { ChatMessage } from '@/types'

interface ChatMessageListProps {
  messages: ChatMessage[]
  userName?: string
  userAvatar?: string
}

export function ChatMessageList({ messages, userName, userAvatar }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { isStreaming, streamingContent } = useChatStore()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="flex-1 overflow-y-auto py-3 space-y-2" role="log" aria-live="polite">
      {/* Empty state */}
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4">
          <div className="relative">
            <UpsyAvatar size={56} />
            <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-400 rounded-full border-2 border-white dark:border-gray-900" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Hi{userName ? `, ${userName.split(' ')[0]}` : ''}! I'm Upsy
            </h4>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed max-w-[260px]">
              Your project assistant. Ask me about sprint status, issue assignments, blockers, workload, or anything about this project.
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.map((msg) => (
        <div key={msg.id} className="group">
          <ChatMessageBubble
            message={msg}
            userName={userName}
            userAvatar={userAvatar}
          />
        </div>
      ))}

      {/* Streaming response */}
      {isStreaming && streamingContent && (
        <div className="group">
          <ChatMessageBubble
            message={{ role: 'assistant', content: streamingContent }}
            isStreaming
          />
        </div>
      )}

      {/* Analyzing indicator (streaming but no content yet) */}
      {isStreaming && !streamingContent && (
        <div className="flex gap-2.5 px-4 py-1">
          <div className="shrink-0 mt-0.5">
            <UpsyAvatar size={28} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 px-1">Upsy</span>
            <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">
                  Analyzing your project...
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
