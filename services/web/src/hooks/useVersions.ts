import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { ProjectVersion, IssueVersion, VersionProgress } from '@/types'

export function useVersions(projectId: string) {
  return useQuery({
    queryKey: ['versions', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/versions`)
      return data.data as ProjectVersion[]
    },
    enabled: !!projectId,
  })
}

export function useCreateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...payload
    }: {
      projectId: string
      name: string
      description?: string
      startDate?: string
      releaseDate?: string
    }) => {
      const { data } = await api.post(
        `/projects/${projectId}/versions`,
        payload,
      )
      return data.data as ProjectVersion
    },
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: ['versions', version.projectId] })
      toast('Version created')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create version',
        'error',
      ),
  })
}

export function useUpdateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      description?: string
      status?: string
      startDate?: string
      releaseDate?: string
    }) => {
      const { data } = await api.put(`/versions/${id}`, payload)
      return data.data as ProjectVersion
    },
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: ['versions', version.projectId] })
      toast('Version updated')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update version',
        'error',
      ),
  })
}

export function useDeleteVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      projectId,
    }: {
      id: string
      projectId: string
    }) => {
      await api.delete(`/versions/${id}`)
      return { projectId }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['versions', result.projectId] })
      toast('Version deleted')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete version',
        'error',
      ),
  })
}

export function useReleaseVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      projectId,
    }: {
      id: string
      projectId: string
    }) => {
      const { data } = await api.post(`/versions/${id}/release`)
      return { ...data.data, projectId } as ProjectVersion
    },
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: ['versions', version.projectId] })
      toast('Version released')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to release version',
        'error',
      ),
  })
}

export function useVersionProgress(versionId: string) {
  return useQuery({
    queryKey: ['version-progress', versionId],
    queryFn: async () => {
      const { data } = await api.get(`/versions/${versionId}/progress`)
      return data.data as VersionProgress
    },
    enabled: !!versionId,
  })
}

export function useIssueVersions(issueId: string) {
  return useQuery({
    queryKey: ['issue-versions', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/versions`)
      return data.data as IssueVersion[]
    },
    enabled: !!issueId,
  })
}

export function useSetIssueVersions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      issueId,
      versionIds,
      relationType = 'fix',
    }: {
      issueId: string
      versionIds: string[]
      relationType?: string
    }) => {
      const { data } = await api.put(`/issues/${issueId}/versions`, {
        versionIds,
        relationType,
      })
      return data.data as IssueVersion[]
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issue-versions', issueId] })
      toast('Versions updated')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update versions',
        'error',
      ),
  })
}
