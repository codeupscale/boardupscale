import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { SavedView, SavedViewFilters } from '@/types'

function savedViewsKey(projectId: string) {
  return ['saved-views', projectId]
}

export function useSavedViews(projectId: string | undefined) {
  return useQuery<SavedView[]>({
    queryKey: savedViewsKey(projectId!),
    queryFn: async () => {
      const res = await api.get('/saved-views', { params: { projectId } })
      return res.data.data ?? res.data
    },
    enabled: !!projectId,
  })
}

export function useCreateSavedView(projectId: string) {
  const qc = useQueryClient()
  return useMutation<SavedView, Error, { name: string; filters: SavedViewFilters; isShared?: boolean }>({
    mutationFn: async (data) => {
      const res = await api.post('/saved-views', data, { params: { projectId } })
      return res.data.data ?? res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: savedViewsKey(projectId) }),
  })
}

export function useUpdateSavedView(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; isShared?: boolean }) =>
      api.patch(`/saved-views/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedViewsKey(projectId) }),
  })
}

export function useDeleteSavedView(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/saved-views/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedViewsKey(projectId) }),
  })
}
