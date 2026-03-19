import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'

export interface GitHubRepo {
  id: number
  owner: string
  name: string
  fullName: string
  private: boolean
  description: string | null
  updatedAt: string
}

interface GitHubConnection {
  id: string
  projectId: string
  repoOwner: string
  repoName: string
  webhookActive: boolean
  createdAt: string
}

interface GitHubEvent {
  id: string
  issueId: string | null
  eventType: 'pr_opened' | 'pr_merged' | 'pr_closed' | 'commit'
  prNumber: number | null
  prTitle: string | null
  prUrl: string | null
  branchName: string | null
  commitSha: string | null
  author: string | null
  createdAt: string
}

export type { GitHubConnection, GitHubEvent }

export function useGithubConnection(projectId: string | undefined) {
  return useQuery({
    queryKey: ['github-connection', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/github/status`)
      return data.data as GitHubConnection | null
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useConnectGithub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      projectId: string
      repoOwner: string
      repoName: string
      accessToken?: string
    }) => {
      const { projectId, ...body } = params
      const { data } = await api.post(`/projects/${projectId}/github/connect`, body)
      return data.data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['github-connection', vars.projectId] })
      toast('GitHub repository connected — webhook registered automatically')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to connect GitHub repository', 'error'),
  })
}

export function useDisconnectGithub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/projects/${projectId}/github/disconnect`)
    },
    onSuccess: (_, projectId) => {
      qc.invalidateQueries({ queryKey: ['github-connection', projectId] })
      toast('GitHub repository disconnected — webhook removed')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to disconnect GitHub repository', 'error'),
  })
}

export function useGithubEvents(issueId: string | undefined) {
  return useQuery({
    queryKey: ['github-events', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/github-events`)
      return data.data as GitHubEvent[]
    },
    enabled: !!issueId,
    staleTime: 60 * 1000,
  })
}

/**
 * Exchange a GitHub OAuth code for an access token and repo list.
 */
export function useGithubOAuthExchange() {
  return useMutation({
    mutationFn: async (params: { code: string; redirectUri: string }) => {
      const { data } = await api.post('/github/oauth/exchange', params)
      return data.data as { accessToken: string; repos: GitHubRepo[] }
    },
  })
}

/**
 * Verify that the webhook on GitHub is still active.
 */
export function useVerifyWebhook() {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data } = await api.post(`/projects/${projectId}/github/verify-webhook`)
      return data.data as { active: boolean }
    },
  })
}
