import { useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { getSocket, isSocketConnected } from '@/lib/socket'
import { toast } from '@/store/ui.store'
import type { Notification } from '@/types'

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

/**
 * Fetch paginated notifications.
 * Polls every 60s as fallback — primary updates come via socket.
 */
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
    // Poll as fallback only — socket handles real-time
    refetchInterval: isSocketConnected() ? false : 60_000,
    staleTime: 10_000,
  })
}

/**
 * Get unread notification count.
 * Updated in real-time via socket 'notification:count' event.
 * Falls back to polling every 60s if socket is disconnected.
 */
export function useUnreadCount() {
  const qc = useQueryClient()

  // Listen for real-time count updates from socket
  useEffect(() => {
    const socket = getSocket()

    const handleCount = (data: { count: number }) => {
      qc.setQueryData(['notifications-unread-count'], { count: data.count })
    }

    const handleNewNotification = (notification: any) => {
      // Invalidate notification list to show new one
      qc.invalidateQueries({ queryKey: ['notifications'] })

      // Increment count optimistically
      qc.setQueryData(['notifications-unread-count'], (old: any) => ({
        count: (old?.count || 0) + 1,
      }))

      // Show toast
      if (notification?.title) {
        toast(notification.title, 'info')
      }
    }

    const handleCountIncrement = () => {
      qc.setQueryData(['notifications-unread-count'], (old: any) => ({
        count: (old?.count || 0) + 1,
      }))
    }

    const handleAllRead = () => {
      qc.setQueryData(['notifications-unread-count'], { count: 0 })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }

    socket.on('notification:count', handleCount)
    socket.on('notification:count-increment', handleCountIncrement)
    socket.on('notification:new', handleNewNotification)
    socket.on('notification:all-read', handleAllRead)

    return () => {
      socket.off('notification:count', handleCount)
      socket.off('notification:count-increment', handleCountIncrement)
      socket.off('notification:new', handleNewNotification)
      socket.off('notification:all-read', handleAllRead)
    }
  }, [qc])

  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const { data } = await api.get('/notifications/unread-count')
      return data as { count: number }
    },
    // Poll only as fallback
    refetchInterval: isSocketConnected() ? false : 60_000,
    staleTime: 30_000,
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
      // Count will be updated via socket 'notification:count' event
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
      qc.setQueryData(['notifications-unread-count'], { count: 0 })
      toast('All notifications marked as read')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to mark all notifications', 'error'),
  })
}
