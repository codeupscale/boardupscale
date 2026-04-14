import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query'
import {
  fetchChannels,
  createGroupChannel,
  getOrCreateDirectChannel,
  fetchMessages,
  sendMessage,
  markChannelAsRead,
  fetchUnreadCount,
} from '@/lib/messaging-api'
import type { MessagingChannel, MessagingMessageData } from '@/lib/messaging-api'

export const MESSAGING_KEYS = {
  channels: ['messaging-channels'] as const,
  messages: (channelId: string) => ['messaging-messages', channelId] as const,
  unreadCount: ['messaging-unread-count'] as const,
}

export function useChannels() {
  return useQuery<MessagingChannel[]>({
    queryKey: MESSAGING_KEYS.channels,
    queryFn: fetchChannels,
    staleTime: 30_000,
  })
}

export function useChannelMessages(channelId: string | null) {
  return useInfiniteQuery<
    { messages: MessagingMessageData[]; hasMore: boolean },
    Error,
    { pages: { messages: MessagingMessageData[]; hasMore: boolean }[] },
    readonly [string, string],
    string | undefined
  >({
    queryKey: MESSAGING_KEYS.messages(channelId ?? ''),
    queryFn: async ({ pageParam }) => {
      return fetchMessages(channelId!, { before: pageParam, limit: 50 })
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined
      return lastPage.messages[0].id
    },
    enabled: !!channelId,
    staleTime: 10_000,
    initialPageParam: undefined,
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      channelId,
      content,
    }: {
      channelId: string
      content: string
    }) => {
      return sendMessage(channelId, content)
    },
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.messages(msg.channelId) })
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.channels })
    },
  })
}

export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; memberIds: string[] }) => {
      return createGroupChannel(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.channels })
    },
  })
}

export function useCreateDirectMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      return getOrCreateDirectChannel(userId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.channels })
    },
  })
}

export function useMarkAsRead(channelId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!channelId) return
      return markChannelAsRead(channelId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.channels })
      qc.invalidateQueries({ queryKey: MESSAGING_KEYS.unreadCount })
    },
  })
}

export function useUnreadCount() {
  return useQuery<number>({
    queryKey: MESSAGING_KEYS.unreadCount,
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
