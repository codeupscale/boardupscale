import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Project, ProjectMember } from '@/types'

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await api.get('/projects')
      return data.data as Project[]
    },
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${id}`)
      return data.data as Project
    },
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      key: string
      description?: string
      type: string
      templateType?: string
    }) => {
      const { data } = await api.post('/projects', payload)
      return data.data as Project
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast('Project created successfully')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create project', 'error'),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      key?: string
      description?: string
      type?: string
      status?: string
    }) => {
      const { data } = await api.patch(`/projects/${id}`, payload)
      return data.data as Project
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      toast('Project updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to update project', 'error'),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast('Project deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to delete project', 'error'),
  })
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/members`)
      return data.data as ProjectMember[]
    },
    enabled: !!projectId,
  })
}

export function useAddProjectMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      userId,
      role,
    }: {
      projectId: string
      userId: string
      role: string
    }) => {
      const { data } = await api.post(`/projects/${projectId}/members`, { userId, role })
      return data.data as ProjectMember
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] })
      toast('Member added')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to add member', 'error'),
  })
}

export function useRemoveProjectMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, memberId }: { projectId: string; memberId: string }) => {
      await api.delete(`/projects/${projectId}/members/${memberId}`)
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] })
      toast('Member removed')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to remove member', 'error'),
  })
}
