import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Sprint } from '@/types'

export function useSprints(projectId: string) {
  return useQuery({
    queryKey: ['sprints', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/sprints`, { params: { projectId } })
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
      const { data } = await api.post(`/sprints`, { projectId, ...payload })
      return data.data as Sprint
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] })
      toast('Sprint created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create sprint', 'error'),
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
      const { data } = await api.patch(`/sprints/${sprintId}`, payload)
      return data.data as Sprint
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] })
      toast('Sprint updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update sprint', 'error'),
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
        `/sprints/${sprintId}/start`,
        { startDate, endDate },
      )
      return data.data as Sprint
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] })
      toast('Sprint started')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to start sprint', 'error'),
  })
}

export function useCompleteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      sprintId,
      moveToSprintId,
    }: {
      projectId: string
      sprintId: string
      moveToSprintId?: string | null
    }) => {
      const { data } = await api.post(`/sprints/${sprintId}/complete`, { moveToSprintId: moveToSprintId ?? undefined })
      return data.data as Sprint
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['issue'] })
      toast('Sprint completed')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to complete sprint', 'error'),
  })
}

export function useDeleteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, sprintId }: { projectId: string; sprintId: string }) => {
      await api.delete(`/sprints/${sprintId}`)
      return { projectId }
    },
    onSuccess: ({ projectId }) => {
      qc.invalidateQueries({ queryKey: ['sprints', projectId] })
      qc.invalidateQueries({ queryKey: ['issues'] })
      toast('Sprint deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete sprint', 'error'),
  })
}
