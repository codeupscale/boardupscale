import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Activity } from '@/types'

export function useActivities(issueId: string, page = 1) {
  return useQuery({
    queryKey: ['activities', issueId, page],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/activities?page=${page}&limit=20`)
      return data as {
        data: Activity[]
        meta: { total: number; page: number; limit: number; totalPages: number }
      }
    },
    enabled: !!issueId,
  })
}
