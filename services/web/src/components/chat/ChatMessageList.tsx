import { useEffect, useRef } from 'react'
import { ChatMessageBubble } from './ChatMessageBubble'
import { useChatStore } from '@/store/chat.store'
import type { ChatMessage } from '@/types'

interface ChatMessageListProps {
  messages: ChatMessage[]
}

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { isStreaming, streamingContent } = useChatStore()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="flex-1 overflow-y-auto py-3 space-y-3" role="log" aria-live="polite">
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm px-6 text-center">
          <p>Ask me anything about this project — issues, sprints, team workload, docs.</p>
        </div>
      )}
      {messages.map((msg) => (
        <ChatMessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && streamingContent && (
        <ChatMessageBubble
          message={{ role: 'assistant', content: streamingContent }}
          isStreaming
        />
      )}
      <div ref={bottomRef} />
    </div>
  )
}
