import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectJiraPayload {
  url: string
  email: string
  apiToken: string
  type?: 'cloud' | 'server'
}

export interface ConnectJiraResult {
  runId: string
  displayName: string
  orgName: string
  projectCount: number
  memberCount: number
  projects: Array<{ key: string; name: string; description?: string }>
}

export interface PreviewProject {
  key: string
  name: string
  issueCount: number
  sprintCount: number
}

export interface PreviewResult {
  projects: PreviewProject[]
  totalIssues: number
  totalSprints: number
  totalMembers: number
  estimatedMinutes: number
}

export interface MigrationOptions {
  importAttachments: boolean
  importComments: boolean
  inviteMembers: boolean
}

export interface StartMigrationPayload {
  runId: string
  projectKeys: string[]
  statusMapping?: Record<string, string>
  roleMapping?: Record<string, string>
  options?: MigrationOptions
}

export interface MigrationStatus {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  currentPhase: number
  currentOffset: number
  totalProjects: number
  processedProjects: number
  totalIssues: number
  processedIssues: number
  failedIssues: number
  totalMembers: number
  processedMembers: number
  totalSprints: number
  processedSprints: number
  totalComments: number
  processedComments: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MigrationRun {
  id: string
  status: string
  currentPhase: number
  totalProjects: number
  processedProjects: number
  totalIssues: number
  processedIssues: number
  failedIssues: number
  selectedProjects: Array<{ key: string; name: string; issueCount: number }> | null
  options: MigrationOptions | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MigrationReport extends MigrationStatus {
  resultSummary: {
    projects: Array<{
      key: string
      name: string
      issueCount: number
      status: 'success' | 'partial' | 'failed'
      boardupscaleProjectId?: string
    }>
    totalMigrated: number
    totalFailed: number
    failedItems: Array<{ type: string; key: string; reason: string }>
  } | null
  errorLog: string[] | null
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useConnectJira() {
  return useMutation({
    mutationFn: async (payload: ConnectJiraPayload) => {
      const { data } = await api.post('/migration/jira/connect', payload)
      return data.data as ConnectJiraResult
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to connect to Jira'
      toast(msg, 'error')
    },
  })
}

export function usePreviewMigration() {
  return useMutation({
    mutationFn: async (payload: { runId: string; projectKeys: string[] }) => {
      const { data } = await api.post('/migration/jira/preview', payload)
      return data.data as PreviewResult
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to load preview'
      toast(msg, 'error')
    },
  })
}

export function useStartMigration() {
  return useMutation({
    mutationFn: async (payload: StartMigrationPayload) => {
      const { data } = await api.post('/migration/jira/start', payload)
      return data.data as { runId: string }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to start migration'
      toast(msg, 'error')
    },
  })
}

export function useMigrationStatus(runId: string | null) {
  return useQuery({
    queryKey: ['migration-status', runId],
    queryFn: async () => {
      const { data } = await api.get(`/migration/jira/status/${runId}`)
      return data.data as MigrationStatus
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return false
      }
      return 3000 // poll every 3s while active
    },
  })
}

export function useRetryMigration() {
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data } = await api.post(`/migration/jira/retry/${runId}`)
      return data.data as { runId: string }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to retry migration'
      toast(msg, 'error')
    },
  })
}

export function useMigrationReport(runId: string | null) {
  return useQuery({
    queryKey: ['migration-report', runId],
    queryFn: async () => {
      const { data } = await api.get(`/migration/jira/report/${runId}`)
      return data.data as MigrationReport
    },
    enabled: !!runId,
  })
}

export function useMigrationHistory(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['migration-history', page, limit],
    queryFn: async () => {
      const { data } = await api.get('/migration/jira/history', {
        params: { page, limit },
      })
      return data.data as { data: MigrationRun[]; total: number; page: number; limit: number }
    },
  })
}
