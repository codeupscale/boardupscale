import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import api from '@/lib/api'
import { useChatStore } from '@/store/chat.store'
import type { ChatConversation, ChatMessage } from '@/types'

export function useChatConversations(projectId: string | undefined) {
  return useQuery<ChatConversation[]>({
    queryKey: ['chat-conversations', projectId],
    queryFn: async () => {
      const { data } = await api.get('/ai/chat/conversations', {
        params: { projectId },
      })
      return data.data ?? data
    },
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

export function useChatMessages(conversationId: string | null) {
  return useQuery<ChatConversation & { messages: ChatMessage[] }>({
    queryKey: ['chat-messages', conversationId],
    queryFn: async () => {
      const { data } = await api.get(`/ai/chat/conversations/${conversationId}`)
      return data.data ?? data
    },
    enabled: !!conversationId,
    staleTime: 10_000,
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data } = await api.post('/ai/chat/conversations', { projectId })
      return (data.data ?? data) as ChatConversation
    },
    onSuccess: (_, projectId) => {
      qc.invalidateQueries({ queryKey: ['chat-conversations', projectId] })
    },
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await api.delete(`/ai/chat/conversations/${id}`)
      return projectId
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ['chat-conversations', projectId] })
    },
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  const { appendStreamChunk, setStreaming, resetStream } = useChatStore.getState()

  const send = useCallback(
    async (conversationId: string, content: string) => {
      resetStream()
      setStreaming(true)

      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('accessToken')

      try {
        const response = await fetch(
          `${baseURL}/ai/chat/conversations/${conversationId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content }),
          },
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader available')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6)
              try {
                const parsed = JSON.parse(jsonStr)
                if (parsed.content) {
                  useChatStore.getState().appendStreamChunk(parsed.content)
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        }

        // Invalidate messages to refetch persisted data
        qc.invalidateQueries({ queryKey: ['chat-messages', conversationId] })
        qc.invalidateQueries({ queryKey: ['chat-conversations'] })
      } catch (err) {
        console.error('Chat stream error:', err)
      } finally {
        useChatStore.getState().setStreaming(false)
      }
    },
    [qc],
  )

  return { send }
}
