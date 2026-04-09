import { useQuery, useMutation } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import api from '@/lib/api'

// ── Types ──

export interface AiStatus {
  enabled: boolean
  available?: boolean
  model?: string
  embeddingModel?: string
  usage?: {
    tokensUsedToday: number
    dailyLimit: number
    percentUsed: number
    tier?: 'normal' | 'warning' | 'exhausted'
    resetsAt?: string
  }
}

export interface FieldSuggestions {
  type?: string
  priority?: string
  title?: string
  assignees?: AssigneeSuggestion[]
}

export interface AssigneeSuggestion {
  userId: string
  displayName: string
  avatarUrl?: string
  reason: string
  score: number
}

export interface IssueSummary {
  summary: string
  keyDecisions: string[]
  blockers: string[]
  nextSteps: string[]
  generatedAt: string
}

export interface SprintInsights {
  sprintId: string
  sprintName: string
  completionPrediction: {
    percentage: number
    predictedEndDate: string
    onTrack: boolean
  }
  workloadBalance: {
    userId: string
    displayName: string
    assignedPoints: number
    completedPoints: number
    issueCount: number
  }[]
  suggestions: string[]
  generatedAt: string
}

export interface AiUsageStats {
  byFeature: { feature: string; tokens: number; requests: number }[]
  byUser: { userId: string; displayName: string; tokens: number; requests: number }[]
  byDay: { date: string; tokens: number; requests: number }[]
  total: { tokens: number; requests: number }
  dailyLimit: number
}

// ── Hooks ──

export function useAiStatus() {
  return useQuery<AiStatus>({
    queryKey: ['ai-status'],
    queryFn: async () => {
      const { data } = await api.get('/ai/status')
      return data.data
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useAiSuggestions(title: string, description?: string, projectId?: string) {
  const [debouncedTitle, setDebouncedTitle] = useState(title)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTitle(title), 800)
    return () => clearTimeout(t)
  }, [title])

  return useQuery<FieldSuggestions | null>({
    queryKey: ['ai-suggest-fields', debouncedTitle, description, projectId],
    queryFn: async () => {
      const { data } = await api.post('/ai/suggest-fields', {
        title: debouncedTitle,
        description,
        projectId,
      })
      if (data.data?.enabled === false) return null
      return data.data
    },
    enabled: debouncedTitle.length >= 10,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useAiSummary(issueId: string) {
  return useMutation<IssueSummary | null>({
    mutationFn: async () => {
      const { data } = await api.post(`/ai/summarize/${issueId}`)
      if (data.data?.enabled === false) return null
      return data.data
    },
  })
}

export function useSprintInsights(sprintId: string | undefined) {
  return useQuery<SprintInsights | null>({
    queryKey: ['ai-sprint-insights', sprintId],
    queryFn: async () => {
      if (!sprintId) return null
      const { data } = await api.get(`/ai/sprint-insights/${sprintId}`)
      if (data.data?.enabled === false) return null
      return data.data
    },
    enabled: !!sprintId,
    staleTime: 15 * 60_000,
    retry: false,
  })
}

export function useAiAssignees(projectId: string | undefined, type?: string) {
  return useQuery<AssigneeSuggestion[]>({
    queryKey: ['ai-suggest-assignee', projectId, type],
    queryFn: async () => {
      const { data } = await api.get('/ai/suggest-assignee', {
        params: { projectId, type },
      })
      return data.data || []
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useAiUsageStats(from?: string, to?: string) {
  return useQuery<AiUsageStats>({
    queryKey: ['ai-usage-stats', from, to],
    queryFn: async () => {
      const { data } = await api.get('/ai/admin/usage', {
        params: { from, to },
      })
      return data.data
    },
    staleTime: 60_000,
    retry: false,
  })
}
