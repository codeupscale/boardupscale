import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Notification } from '@/types'

interface NotificationFilters {
  page?: number
  limit?: number
}

interface NotificationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  unreadCount: number
}

export function useNotifications(filters: NotificationFilters = {}) {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: async () => {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined),
      )
      const { data } = await api.get('/notifications', { params })
      return {
        data: data.data as Notification[],
        meta: data.meta as NotificationMeta,
      }
    },
    refetchInterval: 30_000,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      // Try to get unreadCount from the notifications meta first;
      // fall back to the dedicated endpoint for compatibility
      const { data } = await api.get('/notifications', { params: { limit: 1 } })
      if (data.meta?.unreadCount !== undefined) {
        return { count: data.meta.unreadCount as number }
      }
      const fallback = await api.get('/notifications/unread-count')
      return fallback.data.data as { count: number }
    },
    refetchInterval: 30_000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/notifications/${notificationId}/read`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to mark notification', 'error'),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      toast('All notifications marked as read')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to mark all notifications', 'error'),
  })
}
