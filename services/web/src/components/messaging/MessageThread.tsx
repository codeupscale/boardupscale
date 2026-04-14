import { useEffect, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { MessagingMessageData } from '@/lib/messaging-api'

interface MessageThreadProps {
  messages: MessagingMessageData[]
  currentUserId: string
  hasMore: boolean
  isFetchingMore: boolean
  onLoadMore: () => void
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function groupMessagesByDate(messages: MessagingMessageData[]) {
  const groups: { date: string; messages: MessagingMessageData[] }[] = []
  let currentDate = ''

  for (const msg of messages) {
    const dateKey = new Date(msg.createdAt).toDateString()
    if (dateKey !== currentDate) {
      currentDate = dateKey
      groups.push({ date: msg.createdAt, messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }

  return groups
}

export function MessageThread({
  messages,
  currentUserId,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)

  // Auto-scroll to bottom when new messages arrive at the end
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1]
      // Only auto-scroll if the new message is at the bottom (not historical load)
      if (lastMsg && prevMessageCountRef.current > 0) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      } else if (prevMessageCountRef.current === 0) {
        // Initial load: scroll to bottom immediately
        bottomRef.current?.scrollIntoView()
      }
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

  // Infinite scroll up for history
  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container || isFetchingMore || !hasMore) return
    if (container.scrollTop < 60) {
      onLoadMore()
    }
  }, [hasMore, isFetchingMore, onLoadMore])

  const groups = groupMessagesByDate(messages)

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
    >
      {isFetchingMore && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {hasMore && !isFetchingMore && (
        <button
          onClick={onLoadMore}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Load older messages
        </button>
      )}

      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No messages yet. Start the conversation!
        </div>
      )}

      {groups.map((group) => (
        <div key={group.date}>
          {/* Date separator */}
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground font-medium">
              {formatDateGroup(group.date)}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Messages in this date group */}
          <div className="space-y-1.5">
            {group.messages.map((msg, idx) => {
              const isOwn = msg.senderId === currentUserId
              const isSystem = msg.type === 'system'
              const prevMsg = idx > 0 ? group.messages[idx - 1] : null
              const showSender = !isOwn && (!prevMsg || prevMsg.senderId !== msg.senderId || prevMsg.type === 'system')

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center py-1">
                    <span className="text-[11px] text-muted-foreground italic">
                      {msg.sender?.displayName} {msg.content}
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2',
                    isOwn ? 'justify-end' : 'justify-start',
                  )}
                >
                  {!isOwn && showSender && (
                    <Avatar
                      user={msg.sender}
                      size="xs"
                      className="mt-0.5 shrink-0"
                    />
                  )}
                  {!isOwn && !showSender && <div className="w-6 shrink-0" />}

                  <div className={cn('max-w-[75%] flex flex-col', isOwn ? 'items-end' : 'items-start')}>
                    {showSender && !isOwn && (
                      <span className="text-[11px] text-muted-foreground mb-0.5 ml-1">
                        {msg.sender?.displayName}
                      </span>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap',
                        isOwn
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md',
                      )}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 mx-1">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  )
}
