import api from './api'

export interface MessagingChannel {
  id: string
  organizationId: string
  type: 'direct' | 'group'
  name: string | null
  createdById: string
  createdAt: string
  updatedAt: string
  members: ChannelMember[]
  lastMessage?: MessagingMessageData | null
  unreadCount?: number
}

export interface ChannelMember {
  id: string
  channelId: string
  userId: string
  joinedAt: string
  lastReadAt: string | null
  user: {
    id: string
    displayName: string
    avatarUrl?: string
    email: string
  }
}

export interface MessagingMessageData {
  id: string
  channelId: string
  senderId: string
  content: string
  type: 'text' | 'system'
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  sender: {
    id: string
    displayName: string
    avatarUrl?: string
  }
}

export async function fetchChannels(): Promise<MessagingChannel[]> {
  const { data } = await api.get('/messaging/channels')
  return data.data ?? data
}

export async function createGroupChannel(payload: {
  name: string
  memberIds: string[]
}): Promise<MessagingChannel> {
  const { data } = await api.post('/messaging/channels', payload)
  return data.data ?? data
}

export async function getOrCreateDirectChannel(userId: string): Promise<MessagingChannel> {
  const { data } = await api.post('/messaging/channels/direct', { userId })
  return data.data ?? data
}

export async function fetchMessages(
  channelId: string,
  params?: { before?: string; limit?: number },
): Promise<{ messages: MessagingMessageData[]; hasMore: boolean }> {
  const { data } = await api.get(`/messaging/channels/${channelId}/messages`, { params })
  return data.data ?? data
}

export async function sendMessage(
  channelId: string,
  content: string,
): Promise<MessagingMessageData> {
  const { data } = await api.post(`/messaging/channels/${channelId}/messages`, { content })
  return data.data ?? data
}

export async function markChannelAsRead(channelId: string): Promise<void> {
  await api.put(`/messaging/channels/${channelId}/read`)
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get('/messaging/unread-count')
  const result = data.data ?? data
  return result.count
}
