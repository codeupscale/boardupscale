import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Webhook, WebhookDelivery } from '@/types'

export function useWebhooks(projectId: string) {
  return useQuery({
    queryKey: ['webhooks', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/webhooks`)
      return data.data as Webhook[]
    },
    enabled: !!projectId,
  })
}

export function useWebhook(id: string) {
  return useQuery({
    queryKey: ['webhook', id],
    queryFn: async () => {
      const { data } = await api.get(`/webhooks/${id}`)
      return data as Webhook
    },
    enabled: !!id,
  })
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...payload
    }: {
      projectId: string
      name: string
      url: string
      secret?: string
      events: string[]
      headers?: Record<string, string>
    }) => {
      const { data } = await api.post(`/projects/${projectId}/webhooks`, payload)
      return data as Webhook
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['webhooks', projectId] })
      toast('Webhook created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create webhook', 'error'),
  })
}

export function useUpdateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      ...payload
    }: {
      id: string
      projectId: string
      name?: string
      url?: string
      secret?: string
      events?: string[]
      isActive?: boolean
      headers?: Record<string, string>
    }) => {
      const { data } = await api.put(`/webhooks/${id}`, payload)
      return data as Webhook
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['webhooks', projectId] })
      toast('Webhook updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update webhook', 'error'),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      await api.delete(`/webhooks/${id}`)
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['webhooks', projectId] })
      toast('Webhook deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete webhook', 'error'),
  })
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/webhooks/${id}/test`)
      return data
    },
    onSuccess: () => {
      toast('Test webhook sent')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to send test webhook', 'error'),
  })
}

export function useWebhookDeliveries(webhookId: string, page: number = 1) {
  return useQuery({
    queryKey: ['webhook-deliveries', webhookId, page],
    queryFn: async () => {
      const { data } = await api.get(`/webhooks/${webhookId}/deliveries`, {
        params: { page, limit: 20 },
      })
      return {
        items: data.data as WebhookDelivery[],
        meta: data.meta as { total: number; page: number; limit: number; totalPages: number },
      }
    },
    enabled: !!webhookId,
  })
}

export function useRetryDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ deliveryId }: { deliveryId: string; webhookId: string }) => {
      const { data } = await api.post(`/webhook-deliveries/${deliveryId}/retry`)
      return data as WebhookDelivery
    },
    onSuccess: (_, { webhookId }) => {
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', webhookId] })
      toast('Delivery retry queued')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to retry delivery', 'error'),
  })
}
