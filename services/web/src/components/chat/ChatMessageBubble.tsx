import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSubmitFeedback } from '@/hooks/useChat'
import { UpsyAvatarSmall } from './UpsyAvatar'
import type { ChatMessage } from '@/types'

interface ChatMessageBubbleProps {
  message: ChatMessage | { role: 'assistant'; content: string }
  isStreaming?: boolean
  userName?: string
  userAvatar?: string
}

export function ChatMessageBubble({ message, isStreaming, userName, userAvatar }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user'
  const hasId = 'id' in message
  const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null)
  const submitFeedback = useSubmitFeedback()

  const handleFeedback = (rating: number) => {
    if (!hasId || isUser || feedbackGiven !== null) return
    setFeedbackGiven(rating)
    submitFeedback.mutate({ messageId: (message as ChatMessage).id, rating })
  }

  const userInitials = userName
    ? userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className={cn(
      'flex gap-2.5 px-4 py-1',
      isUser ? 'flex-row-reverse' : 'flex-row',
    )}>
      {/* Avatar */}
      {isUser ? (
        userAvatar ? (
          <img
            src={userAvatar}
            alt={userName || 'You'}
            className="h-7 w-7 rounded-full object-cover shrink-0 ring-2 ring-blue-100 dark:ring-blue-900"
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold ring-2 ring-blue-100 dark:ring-blue-900">
            {userInitials}
          </div>
        )
      ) : (
        <div className="shrink-0 mt-0.5">
          <UpsyAvatarSmall />
        </div>
      )}

      {/* Message content */}
      <div className={cn('max-w-[80%] flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        {/* Sender name */}
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 px-1">
          {isUser ? (userName || 'You') : 'Upsy'}
        </span>

        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-blue-600 text-white rounded-tr-md'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100 rounded-tl-md border border-gray-200/50 dark:border-gray-700/50',
          )}
        >
          <div className={cn(
            'whitespace-pre-wrap break-words',
            !isUser && 'prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&_code]:bg-gray-200/70 dark:[&_code]:bg-gray-700 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-gray-200/70 dark:[&_pre]:bg-gray-700 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_strong]:text-gray-900 dark:[&_strong]:text-white',
          )}>
            {message.content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-500 animate-pulse rounded-sm" />
            )}
          </div>
        </div>

        {/* Feedback buttons for assistant messages */}
        {!isUser && hasId && !isStreaming && (
          <div className={cn(
            'flex items-center gap-0.5 px-1 transition-opacity duration-200',
            feedbackGiven !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            <button
              onClick={() => handleFeedback(1)}
              disabled={feedbackGiven !== null}
              className={cn(
                'p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                feedbackGiven === 1 ? 'text-green-500' : 'text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400',
              )}
              aria-label="Helpful"
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => handleFeedback(-1)}
              disabled={feedbackGiven !== null}
              className={cn(
                'p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                feedbackGiven === -1 ? 'text-red-500' : 'text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400',
              )}
              aria-label="Not helpful"
            >
              <ThumbsDown className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
