import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'

export type SearchReindexStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stalled'

export interface SearchReindexJobStatus {
  id: string
  organizationId: string
  projectId: string
  status: SearchReindexStatus
  dbStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  queueState: string | null
  stallReason: string | null
  currentPhase: number
  currentOffset: number
  completedPhases: number[]
  totalIssues: number
  processedIssues: number
  totalMembers: number
  processedMembers: number
  errorLog: string[] | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

const TERMINAL_STATUSES: SearchReindexStatus[] = ['completed', 'failed', 'cancelled', 'stalled']

function isTerminal(status?: SearchReindexStatus): boolean {
  return !!status && TERMINAL_STATUSES.includes(status)
}

export function useSearchReindexStatus(jobId?: string) {
  return useQuery<SearchReindexJobStatus | null>({
    queryKey: ['search-reindex-status', jobId],
    queryFn: async () => {
      if (!jobId) return null
      const { data } = await api.get(`/search/reindex/status/${jobId}`, {
        params: { _t: Date.now() },
      })
      return data.data ?? null
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status || isTerminal(status)) return false
      return 3000
    },
  })
}

export function useLatestSearchReindex(projectId?: string) {
  return useQuery<SearchReindexJobStatus | null>({
    queryKey: ['search-reindex-latest', projectId],
    queryFn: async () => {
      if (!projectId) return null
      const { data } = await api.get(`/search/reindex/project/${projectId}/latest`, {
        params: { _t: Date.now() },
      })
      return data.data ?? null
    },
    enabled: !!projectId,
    // Only used to discover the latest job id; live progress should poll `/status/:jobId`.
    refetchInterval: false,
  })
}

export function useStartSearchReindex(projectId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('Project is required')
      const { data } = await api.post(`/search/reindex/${projectId}`)
      return data.data as { jobId: string; projectId: string; message: string }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['search-reindex-latest', projectId] })
      if (result?.jobId) {
        queryClient.invalidateQueries({ queryKey: ['search-reindex-status', result.jobId] })
      }
      toast('Search reindex started', 'success')
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to start search reindex'
      toast(message, 'error')
    },
  })
}

export function useCancelSearchReindex() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/search/reindex/cancel/${jobId}`)
      return data.data as { jobId: string }
    },
    onSuccess: (_result, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['search-reindex-status', jobId] })
      toast('Search reindex cancelled', 'success')
    },
    onError: () => toast('Failed to cancel search reindex', 'error'),
  })
}

export function useRetrySearchReindex() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post(`/search/reindex/retry/${jobId}`)
      return data.data as { jobId: string }
    },
    onSuccess: (_result, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['search-reindex-status', jobId] })
      toast('Search reindex retry started', 'success')
    },
    onError: () => toast('Failed to retry search reindex', 'error'),
  })
}

export function getSearchReindexProgressPercent(job?: SearchReindexJobStatus | null): number {
  if (!job) return 0

  const issueTotal = job.totalIssues || 0
  const memberTotal = job.totalMembers || 0
  const issueWeight = issueTotal > 0 ? issueTotal : 1
  const memberWeight = memberTotal > 0 ? memberTotal : 1
  const totalWeight = issueWeight + memberWeight + 1

  let done = 0
  if (job.completedPhases?.includes(1)) done += 1
  done += job.processedIssues ?? 0
  done += job.processedMembers ?? 0

  const target = totalWeight
  return Math.min(100, Math.round((done / target) * 100))
}
