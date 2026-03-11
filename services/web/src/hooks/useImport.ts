import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'

export interface ImportProjectPreview {
  key: string
  name: string
  issueCount: number
}

export interface ImportUserMapping {
  email: string
  displayName: string
  matched: boolean
  matchedUserId?: string
}

export interface ImportPreview {
  projects: ImportProjectPreview[]
  totalIssues: number
  users: ImportUserMapping[]
}

export interface ImportStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total: number
  processed: number
  errors: string[]
}

export function useUploadJiraFile() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/import/jira/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.data as { filePath: string }
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to upload file', 'error'),
  })
}

export function useImportPreview() {
  return useMutation({
    mutationFn: async (filePath: string) => {
      const { data } = await api.post('/import/jira/preview', { filePath })
      return data.data as ImportPreview
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to preview import', 'error'),
  })
}

export function useStartImport() {
  return useMutation({
    mutationFn: async (params: {
      filePath: string
      targetProjectId?: string
      userMapping?: Record<string, string>
    }) => {
      const { data } = await api.post('/import/jira/start', params)
      return data.data as { jobId: string }
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to start import', 'error'),
  })
}

export function useImportStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['import-status', jobId],
    queryFn: async () => {
      const { data } = await api.get(`/import/jira/status/${jobId}`)
      return data.data as ImportStatus
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'completed' || status === 'failed') return false
      return 2000
    },
  })
}
