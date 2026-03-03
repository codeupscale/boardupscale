import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'

export interface AutomationCondition {
  field: string
  operator: string
  value?: any
}

export interface AutomationAction {
  type: string
  config: Record<string, any>
}

export interface AutomationRule {
  id: string
  organizationId: string
  projectId: string
  name: string
  description?: string
  isActive: boolean
  triggerType: string
  triggerConfig: Record<string, any>
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  executionCount: number
  lastExecutedAt?: string
  createdBy?: string
  creator?: { id: string; displayName: string; email: string }
  createdAt: string
  updatedAt: string
}

export interface AutomationLog {
  id: string
  ruleId: string
  issueId?: string
  triggerEvent: string
  actionsExecuted: any[]
  status: string
  errorMessage?: string
  executedAt: string
  issue?: { id: string; key: string; title: string }
}

export function useAutomationRules(projectId: string) {
  return useQuery({
    queryKey: ['automations', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/automations`)
      return data.data as AutomationRule[]
    },
    enabled: !!projectId,
  })
}

export function useAutomationRule(id: string) {
  return useQuery({
    queryKey: ['automation', id],
    queryFn: async () => {
      const { data } = await api.get(`/automations/${id}`)
      return data as AutomationRule
    },
    enabled: !!id,
  })
}

export function useCreateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...payload
    }: {
      projectId: string
      name: string
      description?: string
      triggerType: string
      triggerConfig?: Record<string, any>
      conditions?: AutomationCondition[]
      actions: AutomationAction[]
      isActive?: boolean
    }) => {
      const { data } = await api.post(`/projects/${projectId}/automations`, payload)
      return data as AutomationRule
    },
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['automations', rule.projectId] })
      toast('Automation rule created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to create rule', 'error'),
  })
}

export function useUpdateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      description?: string
      triggerType?: string
      triggerConfig?: Record<string, any>
      conditions?: AutomationCondition[]
      actions?: AutomationAction[]
      isActive?: boolean
    }) => {
      const { data } = await api.put(`/automations/${id}`, payload)
      return data as AutomationRule
    },
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['automations', rule.projectId] })
      qc.invalidateQueries({ queryKey: ['automation', rule.id] })
      toast('Automation rule updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to update rule', 'error'),
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await api.delete(`/automations/${id}`)
      return { projectId }
    },
    onSuccess: ({ projectId }) => {
      qc.invalidateQueries({ queryKey: ['automations', projectId] })
      toast('Automation rule deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to delete rule', 'error'),
  })
}

export function useToggleRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data } = await api.post(`/automations/${id}/toggle`)
      return data as AutomationRule
    },
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['automations', rule.projectId] })
      qc.invalidateQueries({ queryKey: ['automation', rule.id] })
      toast(rule.isActive ? 'Rule enabled' : 'Rule disabled')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to toggle rule', 'error'),
  })
}

export function useRuleLogs(ruleId: string, page: number = 1) {
  return useQuery({
    queryKey: ['automationLogs', ruleId, page],
    queryFn: async () => {
      const { data } = await api.get(`/automations/${ruleId}/logs`, {
        params: { page, limit: 20 },
      })
      return {
        logs: data.data as AutomationLog[],
        meta: data.meta as { total: number; page: number; limit: number; totalPages: number },
      }
    },
    enabled: !!ruleId,
  })
}

export function useTestRule() {
  return useMutation({
    mutationFn: async ({ ruleId, issueId }: { ruleId: string; issueId: string }) => {
      const { data } = await api.post(`/automations/${ruleId}/test`, { issueId })
      return data.data as {
        conditionsMet: boolean
        conditionResults: {
          field: string
          operator: string
          expected: any
          actual: any
          passed: boolean
        }[]
        actionsToExecute: any[]
      }
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to test rule', 'error'),
  })
}
