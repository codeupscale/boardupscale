import { useState, useCallback } from 'react'
import { ThumbsUp, ThumbsDown, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  const [copied, setCopied] = useState(false)
  const submitFeedback = useSubmitFeedback()

  const handleFeedback = (rating: number) => {
    if (!hasId || isUser || feedbackGiven !== null) return
    setFeedbackGiven(rating)
    submitFeedback.mutate({ messageId: (message as ChatMessage).id, rating })
  }

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard may not be available */ }
  }, [message.content])

  const userInitials = userName
    ? userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="flex items-end gap-2 max-w-[85%]">
          <div className="bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[13px] leading-relaxed shadow-sm">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName || 'You'}
              className="h-6 w-6 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-[9px] font-bold">
              {userInitials}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-1.5 group/msg">
      <div className="flex items-start gap-2.5 max-w-[95%]">
        <div className="shrink-0 mt-1">
          <UpsyAvatarSmall />
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3 text-[13px] leading-relaxed border border-border">
            <div className="upsy-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Code blocks with copy button
                  pre({ children }) {
                    return (
                      <div className="relative group/code my-2">
                        <pre className="bg-card text-foreground rounded-lg p-3 overflow-x-auto text-xs leading-relaxed">
                          {children}
                        </pre>
                      </div>
                    )
                  },
                  code({ className, children, ...props }) {
                    const isBlock = className?.startsWith('language-')
                    if (isBlock) {
                      return <code className={cn('text-xs', className)} {...props}>{children}</code>
                    }
                    return (
                      <code className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                        {children}
                      </code>
                    )
                  },
                  p({ children }) {
                    return <p className="my-1.5 first:mt-0 last:mb-0 text-foreground/80">{children}</p>
                  },
                  ul({ children }) {
                    return <ul className="my-1.5 ml-4 list-disc text-foreground/80 space-y-0.5">{children}</ul>
                  },
                  ol({ children }) {
                    return <ol className="my-1.5 ml-4 list-decimal text-foreground/80 space-y-0.5">{children}</ol>
                  },
                  li({ children }) {
                    return <li className="text-foreground/80">{children}</li>
                  },
                  strong({ children }) {
                    return <strong className="font-semibold text-foreground">{children}</strong>
                  },
                  a({ href, children }) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-700">
                        {children}
                      </a>
                    )
                  },
                  blockquote({ children }) {
                    return <blockquote className="border-l-2 border-indigo-300 dark:border-indigo-600 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-2">
                        <table className="text-xs border-collapse w-full">{children}</table>
                      </div>
                    )
                  },
                  th({ children }) {
                    return <th className="border border-border px-2 py-1 bg-muted text-left font-semibold">{children}</th>
                  },
                  td({ children }) {
                    return <td className="border border-border px-2 py-1">{children}</td>
                  },
                  h1({ children }) {
                    return <h1 className="text-base font-bold text-foreground mt-3 mb-1.5">{children}</h1>
                  },
                  h2({ children }) {
                    return <h2 className="text-sm font-bold text-foreground mt-2.5 mb-1">{children}</h2>
                  },
                  h3({ children }) {
                    return <h3 className="text-[13px] font-semibold text-foreground mt-2 mb-1">{children}</h3>
                  },
                  hr() {
                    return <hr className="my-3 border-border" />
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-500 animate-pulse rounded-sm align-text-bottom" />
              )}
            </div>
          </div>

          {/* Action bar — copy + feedback */}
          {!isStreaming && message.content && (
            <div className={cn(
              'flex items-center gap-0.5 mt-1 ml-1 transition-opacity duration-200',
              feedbackGiven !== null ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100',
            )}>
              <button
                onClick={handleCopy}
                className="p-1 rounded-md hover:bg-accent text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                aria-label="Copy"
                title="Copy response"
              >
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </button>
              {hasId && (
                <>
                  <button
                    onClick={() => handleFeedback(1)}
                    disabled={feedbackGiven !== null}
                    className={cn(
                      'p-1 rounded-md transition-colors',
                      feedbackGiven === 1 ? 'text-green-500' : 'text-muted-foreground/60 hover:text-green-500 hover:bg-accent',
                    )}
                    aria-label="Helpful"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleFeedback(-1)}
                    disabled={feedbackGiven !== null}
                    className={cn(
                      'p-1 rounded-md transition-colors',
                      feedbackGiven === -1 ? 'text-red-500' : 'text-muted-foreground/60 hover:text-red-500 hover:bg-accent',
                    )}
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
