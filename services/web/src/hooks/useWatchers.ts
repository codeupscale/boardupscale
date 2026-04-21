import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { WatchersData, ToggleWatchResult } from '@/types'

export function useWatchers(issueId: string) {
  return useQuery({
    queryKey: ['watchers', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/watchers`)
      return data.data as WatchersData
    },
    enabled: !!issueId,
  })
}

export function useToggleWatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ issueId }: { issueId: string }) => {
      const { data } = await api.post(`/issues/${issueId}/watch`)
      return data as ToggleWatchResult
    },
    onSuccess: (result, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['watchers', issueId] })
      toast(result.watching ? 'Watching issue' : 'Stopped watching issue')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update watch status', 'error'),
  })
}
