import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { BoardData, BoardFilters, ColumnPageResult, IssueStatus } from '@/types'

export function useBoard(projectId: string, filters?: BoardFilters) {
  return useQuery({
    queryKey: ['board', projectId, filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.assigneeId) params.set('assigneeId', filters.assigneeId)
      if (filters?.type) params.set('type', filters.type)
      if (filters?.priority) params.set('priority', filters.priority)
      if (filters?.label) params.set('label', filters.label)
      if (filters?.search) params.set('search', filters.search)
      if (filters?.sprintId) params.set('sprintId', filters.sprintId)

      const qs = params.toString()
      const url = `/projects/${projectId}/board${qs ? `?${qs}` : ''}`
      const { data } = await api.get(url)
      return data.data as BoardData
    },
    enabled: !!projectId,
  })
}

export function useColumnLoadMore(
  projectId: string,
  statusId: string,
  filters: BoardFilters,
  offset: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['board-column', projectId, statusId, filters, offset],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.assigneeId) params.set('assigneeId', filters.assigneeId)
      if (filters?.type) params.set('type', filters.type)
      if (filters?.priority) params.set('priority', filters.priority)
      if (filters?.label) params.set('label', filters.label)
      if (filters?.search) params.set('search', filters.search)
      if (filters?.sprintId) params.set('sprintId', filters.sprintId)
      params.set('offset', String(offset))
      params.set('columnLimit', '50')
      const { data } = await api.get(
        `/projects/${projectId}/board/columns/${statusId}/issues?${params.toString()}`,
      )
      return data.data as ColumnPageResult
    },
    enabled,
  })
}

export function useReorderIssues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      payload: { projectId: string; items: Array<{ issueId: string; statusId: string; position: number }> },
    ) => {
      const { data } = await api.patch(`/projects/${payload.projectId}/issues/reorder`, { items: payload.items })
      return data.data
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to reorder issues', 'error')
    },
    onSuccess: () => {
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
      wipLimit?: number
    }) => {
      const { data } = await api.post(`/projects/${projectId}/statuses`, payload)
      return data.data as IssueStatus
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] })
      toast('Status created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create status', 'error'),
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
      wipLimit?: number
    }) => {
      const { data } = await api.patch(`/projects/${projectId}/statuses/${statusId}`, payload)
      return data.data as IssueStatus
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] })
      toast('Status updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update status', 'error'),
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
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete status', 'error'),
  })
}
