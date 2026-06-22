import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { toast } from '@/store/ui.store'
import { ProjectType } from '@/types'

export interface StatusMappingEntry {
  sourceName: string
  sourceCategory: string
  targetName: string
  targetCategory: string
  method: 'exact' | 'alias' | 'category' | 'custom' | 'created' | 'fallback'
}

export interface ImportPreviewWarning {
  code: string
  message: string
  count?: number
}

export interface ImportPreviewResult {
  sourceType: ProjectType
  targetType: ProjectType
  sourceProjectKey: string
  targetProjectKey: string
  targetProjectName: string
  totalIssues: number
  totalSprints: number
  totalComments: number
  totalMembers: number
  totalCustomFields: number
  statusMappings: StatusMappingEntry[]
  warnings: ImportPreviewWarning[]
  dataLossItems: string[]
  estimatedSeconds: number
}

export interface PortabilityJobHealth {
  bullmqState: string | null
  queueWaiting: number
  queueActive: number
  isStalled: boolean
  stallReason: string | null
  canRetry: boolean
  canCancel: boolean
  workerHint: string | null
  pendingSeconds: number
  bundleAvailable: boolean
}

export interface PortabilityJobStatus {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'undone'
  currentPhase: number
  totalIssues: number
  processedIssues: number
  failedIssues: number
  totalComments: number
  processedComments: number
  totalSprints: number
  processedSprints: number
  totalAttachments: number
  processedAttachments: number
  targetProjectId: string | null
  targetProjectKey: string
  targetProjectName: string
  targetType: ProjectType
  sourceType: ProjectType | null
  previewResult: ImportPreviewResult | null
  resultSummary: {
    targetProjectId?: string
    targetProjectKey?: string
    importedIssueCount?: number
    failedIssueCount?: number
    sprintsStripped?: number
    backlogRemapped?: number
    durationMs?: number
  } | null
  errorLog: string[] | null
  startedAt: string | null
  completedAt: string | null
  createdAt?: string
  updatedAt?: string
  bullmqState?: string | null
  queueWaiting?: number
  queueActive?: number
  isStalled?: boolean
  stallReason?: string | null
  canRetry?: boolean
  canCancel?: boolean
  workerHint?: string | null
  pendingSeconds?: number
  bundleAvailable?: boolean
}

export interface PortabilityImportOptions {
  importComments?: boolean
  importMembers?: boolean
  importCustomFields?: boolean
  importSprints?: boolean
  statusMapping?: Record<string, string>
  targetProjectId?: string
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function useExportProjectBundle(projectKey: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${projectKey}/portability/export`, {
        responseType: 'blob',
      })
      const filename = `${projectKey}-bundle-${Date.now()}.json`
      downloadBlob(response.data, filename)
    },
    onSuccess: () => toast('Project bundle exported'),
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Export failed'
      toast(message, 'error')
    },
  })
}

export function useUploadPortabilityBundle() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/portability/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.data as {
        filePath: string
        exportId: string
        sourceProjectKey: string
        sourceType: ProjectType
        issueCount: number
      }
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Upload failed'
      toast(message, 'error')
    },
  })
}

export function usePreviewPortabilityImport() {
  return useMutation({
    mutationFn: async (payload: {
      filePath: string
      targetType?: ProjectType
      targetProjectKey?: string
      targetProjectName?: string
      targetProjectId?: string
    } & PortabilityImportOptions) => {
      const { data } = await api.post('/portability/preview', payload)
      return data.data as { preview: ImportPreviewResult; checksum: string }
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Preview failed'
      toast(message, 'error')
    },
  })
}

export function useStartPortabilityImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      payload: {
        filePath: string
        targetType?: ProjectType
        targetProjectKey?: string
        targetProjectName?: string
        targetProjectId?: string
        previewChecksum?: string
      } & PortabilityImportOptions,
    ) => {
      const { data } = await api.post('/portability/start', payload)
      return data.data as { jobId: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portability-history'] })
      toast('Import started')
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to start import'
      toast(message, 'error')
    },
  })
}

export function usePortabilityJobStatus(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['portability-status', jobId],
    queryFn: async () => {
      const { data } = await api.get(`/portability/status/${jobId}`, {
        params: { _: Date.now() },
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      return data.data as PortabilityJobStatus
    },
    enabled: !!jobId && enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      const status = data?.status
      const stalled = data?.isStalled === true
      if (!status || status === 'processing' || status === 'pending') {
        return stalled ? 5000 : 2000
      }
      return false
    },
  })
}

export function usePortabilityProgressSocket(
  jobId: string | null,
  onProgress?: (data: Record<string, unknown>) => void,
) {
  const handlerRef = useRef(onProgress)
  handlerRef.current = onProgress

  useEffect(() => {
    if (!jobId) return
    const socket = getSocket()
    const handler = (data: Record<string, unknown>) => {
      if (data.jobId === jobId) {
        handlerRef.current?.(data)
      }
    }
    socket.on('portability:progress', handler)
    return () => {
      socket.off('portability:progress', handler)
    }
  }, [jobId])
}

export function useCancelPortabilityImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/portability/cancel/${jobId}`)
      return data.data
    },
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['portability-status', jobId] })
      toast('Import cancelled')
    },
    onError: () => toast('Failed to cancel import', 'error'),
  })
}

export function useRetryPortabilityImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/portability/retry/${jobId}`)
      return data.data as { jobId: string }
    },
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['portability-status', jobId] })
      toast('Import re-queued — worker will resume shortly')
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to retry import'
      toast(message, 'error')
    },
  })
}

export function useUndoPortabilityImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/portability/undo/${jobId}`)
      return data.data
    },
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['portability-status', jobId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast('Undo started — imported issues will be removed')
    },
    onError: () => toast('Failed to undo import', 'error'),
  })
}

export function usePortabilityHistory() {
  return useQuery({
    queryKey: ['portability-history'],
    queryFn: async () => {
      const { data } = await api.get('/portability/history', { params: { limit: 10 } })
      return data.data as {
        items: PortabilityJobStatus[]
        total: number
      }
    },
  })
}

export function usePortabilityPhaseLabel() {
  return useCallback((phase: number) => {
    switch (phase) {
      case 1: return 'Preparing project'
      case 2: return 'Importing members'
      case 3: return 'Importing sprints'
      case 4: return 'Importing issues'
      case 5: return 'Importing comments'
      case 6: return 'Importing custom fields'
      case 7: return 'Importing components'
      case 8: return 'Importing versions'
      case 9: return 'Importing work logs'
      case 10: return 'Importing issue links'
      case 11: return 'Importing watchers'
      case 12: return 'Importing attachments'
      default: return 'Preparing'
    }
  }, [])
}
