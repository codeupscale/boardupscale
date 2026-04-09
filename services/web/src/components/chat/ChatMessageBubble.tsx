import { useState } from 'react'
import { Bot, User, ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSubmitFeedback } from '@/hooks/useChat'
import type { ChatMessage } from '@/types'

interface ChatMessageBubbleProps {
  message: ChatMessage | { role: 'assistant'; content: string }
  isStreaming?: boolean
}

export function ChatMessageBubble({ message, isStreaming }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user'
  const hasId = 'id' in message
  const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null)
  const submitFeedback = useSubmitFeedback()

  const handleFeedback = (rating: number) => {
    if (!hasId || isUser || feedbackGiven !== null) return
    setFeedbackGiven(rating)
    submitFeedback.mutate({ messageId: (message as ChatMessage).id, rating })
  }

  return (
    <div className={cn('flex gap-2 px-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className="max-w-[80%] flex flex-col gap-1">
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
          )}
        >
          <div className="whitespace-pre-wrap break-words prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&_code]:bg-gray-200 dark:[&_code]:bg-gray-700 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-gray-200 dark:[&_pre]:bg-gray-700 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse" />
            )}
          </div>
        </div>
        {/* Feedback buttons for assistant messages */}
        {!isUser && hasId && !isStreaming && (
          <div className={cn(
            'flex items-center gap-1 pl-1 transition-opacity',
            feedbackGiven !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            <button
              onClick={() => handleFeedback(1)}
              disabled={feedbackGiven !== null}
              className={cn(
                'p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                feedbackGiven === 1 ? 'text-green-600' : 'text-gray-400 hover:text-gray-600',
              )}
              aria-label="Helpful"
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => handleFeedback(-1)}
              disabled={feedbackGiven !== null}
              className={cn(
                'p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                feedbackGiven === -1 ? 'text-red-600' : 'text-gray-400 hover:text-gray-600',
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
