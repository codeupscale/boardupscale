import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { isApiNotFound } from '@/lib/api-errors'
import { renameRecentProjectKey } from '@/lib/recent-projects'
import { toast } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { Project, ProjectMember } from '@/types'

interface ProjectFilters {
  search?: string
  page?: number
  limit?: number
}

export function useProjects(filters: ProjectFilters = {}) {
  const organizationId = useAuthStore((s) => s.user?.organizationId)
  return useQuery({
    queryKey: ['projects', organizationId, filters],
    queryFn: async () => {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
      )
      const { data } = await api.get('/projects', { params })
      return {
        data: data.data as Project[],
        meta: data.meta as { total: number; page: number; limit: number; totalPages: number },
      }
    },
    staleTime: 30_000,
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
    retry: (failureCount, error) => !isApiNotFound(error) && failureCount < 2,
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
  const organizationId = useAuthStore((s) => s.user?.organizationId)
  const userId = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async ({
      id,
      previousKey,
      ...payload
    }: {
      id: string
      previousKey?: string
      name?: string
      key?: string
      description?: string
      status?: string
    }) => {
      const { data } = await api.patch(`/projects/${id}`, payload)
      return { project: data.data as Project, previousKey }
    },
    onSuccess: ({ project, previousKey }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      qc.invalidateQueries({ queryKey: ['project', project.key] })
      if (previousKey && previousKey !== project.key) {
        qc.invalidateQueries({ queryKey: ['project', previousKey] })
        qc.removeQueries({ queryKey: ['project', previousKey] })
        qc.invalidateQueries({ queryKey: ['board', previousKey] })
        qc.invalidateQueries({ queryKey: ['board', project.key] })
        if (organizationId && userId) {
          renameRecentProjectKey(organizationId, userId, previousKey, {
            key: project.key,
            name: project.name,
          })
        }
        toast(`Project key updated to ${project.key}`)
      } else {
        toast('Project updated')
      }
      return { project, previousKey }
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update project', 'error'),
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
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete project', 'error'),
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
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to add member', 'error'),
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
    onError: (err: any) => {
      const d = err?.response?.data
      toast(d?.message || d?.error?.message || 'Failed to remove member', 'error')
    },
  })
}
