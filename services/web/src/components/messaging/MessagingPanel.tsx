import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Plus, ArrowLeft } from 'lucide-react'
import { useMessagingStore } from '@/store/messaging.store'
import { useMe } from '@/hooks/useAuth'
import {
  useChannels,
  useChannelMessages,
  useSendMessage,
  useCreateChannel,
  useCreateDirectMessage,
  useMarkAsRead,
} from '@/hooks/useMessaging'
import { getSocket } from '@/lib/socket'
import { useQueryClient } from '@tanstack/react-query'
import { MESSAGING_KEYS } from '@/hooks/useMessaging'
import { ChannelList } from './ChannelList'
import { MessageThread } from './MessageThread'
import { MessageInput } from './MessageInput'
import { NewChannelDialog } from './NewChannelDialog'
import { cn } from '@/lib/utils'
import type { MessagingChannel, MessagingMessageData } from '@/lib/messaging-api'

export function MessagingPanel() {
  const { isOpen, setOpen, activeChannelId, setActiveChannel } = useMessagingStore()
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({})

  const { data: me } = useMe()
  const { data: channels = [] } = useChannels()
  const {
    data: messagesData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useChannelMessages(activeChannelId)
  const sendMessageMutation = useSendMessage()
  const createChannelMutation = useCreateChannel()
  const createDMMutation = useCreateDirectMessage()
  const markAsReadMutation = useMarkAsRead(activeChannelId)
  const qc = useQueryClient()

  // Flatten paginated messages
  const allMessages = useMemo(() => {
    if (!messagesData?.pages) return []
    const msgs: MessagingMessageData[] = []
    for (const page of messagesData.pages) {
      msgs.push(...page.messages)
    }
    return msgs
  }, [messagesData])

  // Get active channel info
  const activeChannel = channels.find((c) => c.id === activeChannelId)

  // Socket event handlers for real-time
  useEffect(() => {
    const socket = getSocket()

    const handleNewMessage = (data: { channelId: string; message: MessagingMessageData }) => {
      // Invalidate the channel's message cache
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.messages(data.channelId) })
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.channels })
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.unreadCount })
    }

    const handleChannelCreated = () => {
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.channels })
    }

    const handleTyping = (data: { channelId: string; userId: string }) => {
      if (data.userId === me?.id) return

      // Find the user display name from the channel members
      const channel = channels.find((c) => c.id === data.channelId)
      const member = channel?.members?.find((m) => m.userId === data.userId)
      const displayName = member?.user?.displayName || 'Someone'

      setTypingUsers((prev) => {
        const current = prev[data.channelId] || []
        if (current.includes(displayName)) return prev
        return { ...prev, [data.channelId]: [...current, displayName] }
      })

      // Clear typing indicator after 3s
      setTimeout(() => {
        setTypingUsers((prev) => {
          const current = prev[data.channelId] || []
          return {
            ...prev,
            [data.channelId]: current.filter((n) => n !== displayName),
          }
        })
      }, 3000)
    }

    socket.on('chat:new-message', handleNewMessage)
    socket.on('chat:channel-created', handleChannelCreated)
    socket.on('chat:typing', handleTyping)

    return () => {
      socket.off('chat:new-message', handleNewMessage)
      socket.off('chat:channel-created', handleChannelCreated)
      socket.off('chat:typing', handleTyping)
    }
  }, [qc, me?.id, channels])

  // Join/leave chat rooms
  useEffect(() => {
    if (!activeChannelId) return
    const socket = getSocket()
    socket.emit('join:chat', { channelId: activeChannelId })

    // Mark as read when viewing a channel
    markAsReadMutation.mutate()

    return () => {
      socket.emit('leave:chat', { channelId: activeChannelId })
    }
  }, [activeChannelId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Select first channel on load if none active
  useEffect(() => {
    if (!activeChannelId && channels.length > 0 && isOpen) {
      setActiveChannel(channels[0].id)
    }
  }, [channels, activeChannelId, isOpen, setActiveChannel])

  const handleSend = useCallback(
    (content: string) => {
      if (!activeChannelId) return
      sendMessageMutation.mutate({ channelId: activeChannelId, content })
    },
    [activeChannelId, sendMessageMutation],
  )

  const handleCreateGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      const channel = await createChannelMutation.mutateAsync({ name, memberIds })
      setActiveChannel(channel.id)
    },
    [createChannelMutation, setActiveChannel],
  )

  const handleCreateDM = useCallback(
    async (userId: string) => {
      const channel = await createDMMutation.mutateAsync(userId)
      setActiveChannel(channel.id)
    },
    [createDMMutation, setActiveChannel],
  )

  const getChannelTitle = (channel: MessagingChannel | undefined) => {
    if (!channel) return 'Messages'
    if (channel.type === 'group') return channel.name || 'Group'
    const other = channel.members?.find((m) => m.userId !== me?.id)
    return other?.user?.displayName || 'Direct Message'
  }

  if (!isOpen) return null

  const showThread = !!activeChannelId

  return (
    <>
      <div
        role="dialog"
        aria-label="Messages"
        className={cn(
          'fixed bottom-20 right-5 z-50 flex flex-col',
          'bg-card rounded-2xl',
          'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]',
          'border border-border',
          'animate-in slide-in-from-bottom-4 fade-in duration-300',
          'w-[420px] h-[580px] max-h-[85vh]',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border rounded-t-2xl">
          <div className="flex items-center gap-2">
            {showThread && (
              <button
                onClick={() => setActiveChannel(null)}
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Back to channels"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {showThread ? getChannelTitle(activeChannel) : 'Messages'}
            </h3>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowNewDialog(true)}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close messages"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body: channel list or message thread */}
        {!showThread ? (
          <ChannelList
            channels={channels}
            activeChannelId={activeChannelId}
            currentUserId={me?.id || ''}
            onSelect={(id) => setActiveChannel(id)}
          />
        ) : (
          <>
            <MessageThread
              messages={allMessages}
              currentUserId={me?.id || ''}
              hasMore={!!hasNextPage}
              isFetchingMore={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
            />
            <MessageInput
              channelId={activeChannelId!}
              onSend={handleSend}
              typingUsers={typingUsers[activeChannelId!] || []}
            />
          </>
        )}
      </div>

      <NewChannelDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreateGroup={handleCreateGroup}
        onCreateDM={handleCreateDM}
      />
    </>
  )
}
