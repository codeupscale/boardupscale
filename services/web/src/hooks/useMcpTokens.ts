import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'

export interface McpToken {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string
  createdAt: string
}

export interface CreatedMcpToken extends McpToken {
  /** Raw token — returned only once, at creation. */
  token: string
}

const errorMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.error?.message || fallback

export function useMcpTokens() {
  return useQuery({
    queryKey: ['mcp-tokens'],
    queryFn: async () => {
      const { data } = await api.get('/mcp/tokens')
      return data.data as McpToken[]
    },
  })
}

export function useCreateMcpToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; expiresInDays: number; allowWrite: boolean }) => {
      const { data } = await api.post('/mcp/tokens', payload)
      return data.data as CreatedMcpToken
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-tokens'] })
      toast('MCP token created')
    },
    onError: (err: any) => toast(errorMessage(err, 'Failed to create token'), 'error'),
  })
}

export function useRevokeMcpToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/mcp/tokens/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-tokens'] })
      toast('Token revoked')
    },
    onError: (err: any) => toast(errorMessage(err, 'Failed to revoke token'), 'error'),
  })
}
