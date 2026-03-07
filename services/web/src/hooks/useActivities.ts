import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Activity } from '@/types'

interface ActivitiesResponse {
  data: Activity[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export function useActivities(issueId: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: ['activities', issueId, page, limit],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/activities`, {
        params: { page, limit },
      })
      return data as ActivitiesResponse
    },
    enabled: !!issueId,
  })
}
