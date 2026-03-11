import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Issue, WorkLog } from '@/types'

interface IssueFilters {
  projectId?: string
  sprintId?: string
  assigneeId?: string
  type?: string
  priority?: string
  statusId?: string
  search?: string
  page?: number
  limit?: number
  deleted?: boolean
}

export function useIssues(filters: IssueFilters | undefined = {}) {
  return useQuery({
    queryKey: ['issues', filters],
    enabled: filters !== undefined,
    queryFn: async () => {
      const params = Object.fromEntries(
        Object.entries(filters ?? {}).filter(([, v]) => v !== undefined && v !== ''),
      )
      const { data } = await api.get('/issues', { params })
      return { data: data.data as Issue[], total: data.meta?.total ?? 0, page: data.meta?.page ?? 1, limit: data.meta?.limit ?? 25 }
    },
  })
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: ['issue', id],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${id}`)
      return data.data as Issue
    },
    enabled: !!id,
  })
}

export function useCreateIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      projectId: string
      title: string
      description?: string
      type: string
      priority: string
      statusId?: string
      assigneeId?: string
      parentId?: string
      sprintId?: string
      dueDate?: string
      storyPoints?: number
      timeEstimate?: number
      labels?: string[]
    }) => {
      const { data } = await api.post('/issues', payload)
      return data.data as Issue
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      toast('Issue created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to create issue', 'error'),
  })
}

export function useUpdateIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      title?: string
      description?: string
      type?: string
      priority?: string
      statusId?: string
      assigneeId?: string | null
      sprintId?: string | null
      dueDate?: string | null
      storyPoints?: number | null
      timeEstimate?: number | null
      labels?: string[]
    }) => {
      const { data } = await api.patch(`/issues/${id}`, payload)
      return data.data as Issue
    },
    onSuccess: (issue) => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['issue', issue.id] })
      qc.invalidateQueries({ queryKey: ['board'] })
      toast('Issue updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to update issue', 'error'),
  })
}

/** Silent issue update — no toast, for drag-and-drop operations */
export function useMoveIssueSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      sprintId,
    }: {
      id: string
      sprintId: string | null
    }) => {
      const { data } = await api.patch(`/issues/${id}`, { sprintId })
      return data.data as Issue
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to move issue', 'error'),
  })
}

export function useDeleteIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await api.delete(`/issues/${id}`)
      return { projectId }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      toast('Issue deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to delete issue', 'error'),
  })
}

export function useWorkLogs(issueId: string) {
  return useQuery({
    queryKey: ['worklogs', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/worklogs`)
      return data.data as WorkLog[]
    },
    enabled: !!issueId,
  })
}

export function useAddWorkLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      issueId,
      timeSpent,
      description,
      loggedAt,
    }: {
      issueId: string
      timeSpent: number
      description?: string
      loggedAt?: string
    }) => {
      const { data } = await api.post(`/issues/${issueId}/worklogs`, {
        timeSpent,
        description,
        loggedAt,
      })
      return data.data as WorkLog
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['worklogs', issueId] })
      qc.invalidateQueries({ queryKey: ['issue', issueId] })
      toast('Work logged')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to log work', 'error'),
  })
}
