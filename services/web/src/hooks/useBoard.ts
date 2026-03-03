import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { BoardData, IssueStatus } from '@/types'

export function useBoard(projectId: string) {
  return useQuery({
    queryKey: ['board', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/board`)
      return data.data as BoardData
    },
    enabled: !!projectId,
  })
}

export function useReorderIssues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      updates: Array<{ issueId: string; statusId: string; position: number }>,
    ) => {
      const { data } = await api.post('/issues/reorder', { updates })
      return data.data
    },
    onError: (err: any) => {
      toast(err?.response?.data?.error?.message || 'Failed to reorder issues', 'error')
    },
    onSuccess: (_, updates) => {
      // Invalidate all boards that might be affected
      qc.invalidateQueries({ queryKey: ['board'] })
      qc.invalidateQueries({ queryKey: ['issues'] })
    },
  })
}

export function useCreateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...payload
    }: {
      projectId: string
      name: string
      category: string
      color?: string
    }) => {
      const { data } = await api.post(`/projects/${projectId}/statuses`, payload)
      return data.data as IssueStatus
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ['board', status.projectId] })
      toast('Status created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to create status', 'error'),
  })
}

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      statusId,
      ...payload
    }: {
      projectId: string
      statusId: string
      name?: string
      category?: string
      color?: string
      position?: number
    }) => {
      const { data } = await api.patch(`/projects/${projectId}/statuses/${statusId}`, payload)
      return data.data as IssueStatus
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ['board', status.projectId] })
      toast('Status updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to update status', 'error'),
  })
}

export function useDeleteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, statusId }: { projectId: string; statusId: string }) => {
      await api.delete(`/projects/${projectId}/statuses/${statusId}`)
      return { projectId }
    },
    onSuccess: ({ projectId }) => {
      qc.invalidateQueries({ queryKey: ['board', projectId] })
      toast('Status deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to delete status', 'error'),
  })
}
