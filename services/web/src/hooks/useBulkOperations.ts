import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { useSelectionStore } from '@/store/selection.store'

interface BulkUpdatePayload {
  issueIds: string[]
  assigneeId?: string
  statusId?: string
  sprintId?: string | null
  type?: string
  priority?: string
  labels?: string[]
  storyPoints?: number
}

interface BulkMovePayload {
  issueIds: string[]
  targetProjectId: string
  targetStatusId?: string
}

interface BulkDeletePayload {
  issueIds: string[]
}

interface BulkTransitionPayload {
  issueIds: string[]
  statusId: string
}

export function useBulkUpdate() {
  const qc = useQueryClient()
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  return useMutation({
    mutationFn: async (payload: BulkUpdatePayload) => {
      const { data } = await api.patch('/issues/bulk-update', payload)
      return data.data as { affected: number }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      clearSelection()
      toast(`${result.affected} issue${result.affected !== 1 ? 's' : ''} updated`)
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to bulk update issues', 'error'),
  })
}

export function useBulkMove() {
  const qc = useQueryClient()
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  return useMutation({
    mutationFn: async (payload: BulkMovePayload) => {
      const { data } = await api.post('/issues/bulk-move', payload)
      return data.data as { affected: number }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      clearSelection()
      toast(`${result.affected} issue${result.affected !== 1 ? 's' : ''} moved`)
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to move issues', 'error'),
  })
}

export function useBulkDelete() {
  const qc = useQueryClient()
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  return useMutation({
    mutationFn: async (payload: BulkDeletePayload) => {
      const { data } = await api.post('/issues/bulk-delete', payload)
      return data.data as { affected: number }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      clearSelection()
      toast(`${result.affected} issue${result.affected !== 1 ? 's' : ''} deleted`)
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete issues', 'error'),
  })
}

export function useBulkRestore() {
  const qc = useQueryClient()
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  return useMutation({
    mutationFn: async (payload: BulkDeletePayload) => {
      const { data } = await api.post('/issues/bulk-restore', payload)
      return data.data as { affected: number }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      clearSelection()
      toast(`${result.affected} issue${result.affected !== 1 ? 's' : ''} restored`)
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to restore issues', 'error'),
  })
}

export function useBulkTransition() {
  const qc = useQueryClient()
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  return useMutation({
    mutationFn: async (payload: BulkTransitionPayload) => {
      const { data } = await api.post('/issues/bulk-transition', payload)
      return data.data as { affected: number }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      clearSelection()
      toast(`${result.affected} issue${result.affected !== 1 ? 's' : ''} transitioned`)
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to transition issues', 'error'),
  })
}
