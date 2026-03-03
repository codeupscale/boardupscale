import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { ProjectComponent } from '@/types'

export function useComponents(projectId: string) {
  return useQuery({
    queryKey: ['components', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/components`)
      return data.data as ProjectComponent[]
    },
    enabled: !!projectId,
  })
}

export function useCreateComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...payload
    }: {
      projectId: string
      name: string
      description?: string
      leadId?: string
    }) => {
      const { data } = await api.post(
        `/projects/${projectId}/components`,
        payload,
      )
      return data.data as ProjectComponent
    },
    onSuccess: (component) => {
      qc.invalidateQueries({
        queryKey: ['components', component.projectId],
      })
      toast('Component created')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.error?.message || 'Failed to create component',
        'error',
      ),
  })
}

export function useUpdateComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      description?: string
      leadId?: string
    }) => {
      const { data } = await api.put(`/components/${id}`, payload)
      return data.data as ProjectComponent
    },
    onSuccess: (component) => {
      qc.invalidateQueries({
        queryKey: ['components', component.projectId],
      })
      toast('Component updated')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.error?.message || 'Failed to update component',
        'error',
      ),
  })
}

export function useDeleteComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      projectId,
    }: {
      id: string
      projectId: string
    }) => {
      await api.delete(`/components/${id}`)
      return { projectId }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({
        queryKey: ['components', result.projectId],
      })
      toast('Component deleted')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.error?.message || 'Failed to delete component',
        'error',
      ),
  })
}

export function useIssueComponents(issueId: string) {
  return useQuery({
    queryKey: ['issue-components', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/components`)
      return data.data as ProjectComponent[]
    },
    enabled: !!issueId,
  })
}

export function useSetIssueComponents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      issueId,
      componentIds,
    }: {
      issueId: string
      componentIds: string[]
    }) => {
      const { data } = await api.put(`/issues/${issueId}/components`, {
        componentIds,
      })
      return data.data as ProjectComponent[]
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issue-components', issueId] })
      toast('Components updated')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.error?.message || 'Failed to update components',
        'error',
      ),
  })
}
