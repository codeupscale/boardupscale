import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Sprint } from '@/types'

export function useSprints(projectId: string) {
  return useQuery({
    queryKey: ['sprints', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/sprints`)
      return data.data as Sprint[]
    },
    enabled: !!projectId,
  })
}

export function useCreateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...payload
    }: {
      projectId: string
      name: string
      goal?: string
      startDate?: string
      endDate?: string
    }) => {
      const { data } = await api.post(`/projects/${projectId}/sprints`, payload)
      return data.data as Sprint
    },
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: ['sprints', sprint.projectId] })
      toast('Sprint created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to create sprint', 'error'),
  })
}

export function useUpdateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      sprintId,
      ...payload
    }: {
      projectId: string
      sprintId: string
      name?: string
      goal?: string
      startDate?: string
      endDate?: string
    }) => {
      const { data } = await api.patch(`/projects/${projectId}/sprints/${sprintId}`, payload)
      return data.data as Sprint
    },
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: ['sprints', sprint.projectId] })
      toast('Sprint updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to update sprint', 'error'),
  })
}

export function useStartSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      sprintId,
      startDate,
      endDate,
    }: {
      projectId: string
      sprintId: string
      startDate: string
      endDate: string
    }) => {
      const { data } = await api.post(
        `/projects/${projectId}/sprints/${sprintId}/start`,
        { startDate, endDate },
      )
      return data.data as Sprint
    },
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: ['sprints', sprint.projectId] })
      toast('Sprint started')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to start sprint', 'error'),
  })
}

export function useCompleteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      sprintId,
    }: {
      projectId: string
      sprintId: string
    }) => {
      const { data } = await api.post(`/projects/${projectId}/sprints/${sprintId}/complete`)
      return data.data as Sprint
    },
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: ['sprints', sprint.projectId] })
      qc.invalidateQueries({ queryKey: ['board', sprint.projectId] })
      qc.invalidateQueries({ queryKey: ['issues'] })
      toast('Sprint completed')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to complete sprint', 'error'),
  })
}

export function useDeleteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, sprintId }: { projectId: string; sprintId: string }) => {
      await api.delete(`/projects/${projectId}/sprints/${sprintId}`)
      return { projectId }
    },
    onSuccess: ({ projectId }) => {
      qc.invalidateQueries({ queryKey: ['sprints', projectId] })
      qc.invalidateQueries({ queryKey: ['issues'] })
      toast('Sprint deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to delete sprint', 'error'),
  })
}
