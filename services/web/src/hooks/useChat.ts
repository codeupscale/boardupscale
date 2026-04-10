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

export function useChatMessages(conversationId: string | null, before?: string) {
  return useQuery<ChatConversation & { messages: ChatMessage[]; hasMore?: boolean }>({
    queryKey: ['chat-messages', conversationId, before],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (before) params.before = before
      const { data } = await api.get(`/ai/chat/conversations/${conversationId}`, { params })
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

export function useChatSearch(projectId?: string) {
  return useMutation({
    mutationFn: async (query: string) => {
      const { data } = await api.get('/ai/chat/search', {
        params: { q: query, projectId },
      })
      return data.data ?? data
    },
  })
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async ({ messageId, rating, comment }: { messageId: string; rating: number; comment?: string }) => {
      const { data } = await api.post(`/ai/chat/messages/${messageId}/feedback`, { rating, comment })
      return data.data ?? data
    },
  })
}

export function useSendMessage() {
  const qc = useQueryClient()

  const send = useCallback(
    async (conversationId: string, content: string) => {
      const store = useChatStore.getState()
      store.resetStream()
      store.setStreaming(true)

      const abortController = new AbortController()
      store.setAbortController(abortController)

      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('accessToken')

      const maxRetries = 2
      let retries = 0

      const attempt = async (): Promise<void> => {
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
              signal: abortController.signal,
            },
          )

          if (!response.ok) {
            const errorBody = await response.text().catch(() => '')
            if (response.status === 429) {
              throw new Error(errorBody || 'Rate limit exceeded. Please try again later.')
            }
            if (response.status === 409) {
              throw new Error('Another AI request is in progress. Please wait.')
            }
            throw new Error(`HTTP ${response.status}`)
          }

          const reader = response.body?.getReader()
          if (!reader) throw new Error('No reader available')

          const decoder = new TextDecoder()
          let buffer = ''
          let currentEvent = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6)
                try {
                  const parsed = JSON.parse(jsonStr)

                  if (currentEvent === 'chunk' && parsed.content) {
                    useChatStore.getState().appendStreamChunk(parsed.content)
                  } else if (currentEvent === 'error' && parsed.message) {
                    useChatStore.getState().setStreamError(parsed.message)
                  } else if (currentEvent === 'cancelled') {
                    // Stream was cancelled, partial content already saved
                  }
                  // 'done' event — stream complete
                } catch {
                  // skip malformed JSON
                }
                currentEvent = ''
              }
            }
          }

          qc.invalidateQueries({ queryKey: ['chat-messages', conversationId] })
          qc.invalidateQueries({ queryKey: ['chat-conversations'] })
        } catch (err: any) {
          if (err.name === 'AbortError') {
            // User cancelled — invalidate to pick up partial saved message
            qc.invalidateQueries({ queryKey: ['chat-messages', conversationId] })
            qc.invalidateQueries({ queryKey: ['chat-conversations'] })
            return
          }
          // Retry on network errors (not rate limits or conflicts)
          if (retries < maxRetries && !err.message.includes('Rate limit') && !err.message.includes('Another AI')) {
            retries++
            await new Promise((r) => setTimeout(r, 1000 * retries))
            return attempt()
          }
          console.error('Chat stream error:', err)
          useChatStore.getState().setStreamError(err.message || 'Failed to send message')
        }
      }

      try {
        await attempt()
      } finally {
        useChatStore.getState().setStreaming(false)
        useChatStore.getState().setAbortController(null)
      }
    },
    [qc],
  )

  return { send }
}
