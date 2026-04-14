import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { MessagingChannel } from '@/lib/messaging-api'
import { Users, MessageSquare } from 'lucide-react'

interface ChannelListProps {
  channels: MessagingChannel[]
  activeChannelId: string | null
  currentUserId: string
  onSelect: (channelId: string) => void
}

function getChannelDisplayName(
  channel: MessagingChannel,
  currentUserId: string,
): string {
  if (channel.type === 'group') {
    return channel.name || 'Unnamed Group'
  }
  // For DMs, show the other user's name
  const otherMember = channel.members?.find((m) => m.userId !== currentUserId)
  return otherMember?.user?.displayName || 'Direct Message'
}

function getChannelAvatar(channel: MessagingChannel, currentUserId: string) {
  if (channel.type === 'direct') {
    const otherMember = channel.members?.find((m) => m.userId !== currentUserId)
    if (otherMember?.user) {
      return <Avatar user={otherMember.user} size="sm" />
    }
  }
  return (
    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
      <Users className="h-4 w-4 text-muted-foreground" />
    </div>
  )
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len) + '...'
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  if (diffHr < 24) return `${diffHr}h`
  if (diffDay < 7) return `${diffDay}d`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ChannelList({
  channels,
  activeChannelId,
  currentUserId,
  onSelect,
}: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Start a direct message or create a group channel
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {channels.map((channel) => {
        const isActive = channel.id === activeChannelId
        const displayName = getChannelDisplayName(channel, currentUserId)
        const lastMsg = channel.lastMessage
        const unread = channel.unreadCount ?? 0

        return (
          <button
            key={channel.id}
            onClick={() => onSelect(channel.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
              'hover:bg-accent/50',
              isActive && 'bg-accent',
            )}
          >
            {getChannelAvatar(channel, currentUserId)}

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-sm truncate',
                    unread > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                  )}
                >
                  {displayName}
                </span>
                {lastMsg && (
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {formatRelativeTime(lastMsg.createdAt)}
                  </span>
                )}
              </div>
              {lastMsg && (
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground truncate">
                    {lastMsg.type === 'system'
                      ? `${lastMsg.sender?.displayName} ${lastMsg.content}`
                      : truncate(lastMsg.content, 40)}
                  </span>
                  {unread > 0 && (
                    <span className="ml-2 shrink-0 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
