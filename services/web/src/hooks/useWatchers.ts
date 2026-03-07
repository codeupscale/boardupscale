import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { IssueWatcher } from '@/types'

export function useWatchers(issueId: string) {
  return useQuery({
    queryKey: ['watchers', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/watchers`)
      return data.data as IssueWatcher[]
    },
    enabled: !!issueId,
  })
}

export function useToggleWatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ issueId }: { issueId: string }) => {
      const { data } = await api.post(`/issues/${issueId}/watch`)
      return data.data as { watching: boolean }
    },
    onSuccess: (result, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['watchers', issueId] })
      toast(result.watching ? 'Now watching this issue' : 'Stopped watching this issue')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || 'Failed to update watch status', 'error'),
  })
}

export function useUnwatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ issueId }: { issueId: string }) => {
      const { data } = await api.post(`/issues/${issueId}/unwatch`)
      return data.data as { watching: false }
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['watchers', issueId] })
      toast('Stopped watching this issue')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || 'Failed to unwatch', 'error'),
  })
}
