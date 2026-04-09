import { useEffect, useCallback, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { getSocket, getSocketStatus, onSocketStatus } from '@/lib/socket'
import { toast } from '@/store/ui.store'
import type { Notification } from '@/types'

// ─── Query keys (centralized to prevent mismatch bugs) ─────────────────────

export const NOTIFICATION_KEYS = {
  all: ['notifications'] as const,
  list: (filters: NotificationFilters) => ['notifications', filters] as const,
  unreadCount: ['notifications-unread-count'] as const,
}

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

interface NotificationsResponse {
  data: Notification[]
  meta: NotificationMeta
}

// ─── Reactive socket status for dynamic polling intervals ───────────────────

function subscribeToStatus(cb: () => void) {
  return onSocketStatus(cb)
}

function useIsSocketConnected(): boolean {
  return useSyncExternalStore(subscribeToStatus, getSocketStatus) === 'connected'
}

// ─── Data hooks ─────────────────────────────────────────────────────────────

/**
 * Fetch paginated notifications.
 * When WebSocket is connected, polls infrequently (2 min) as a safety net.
 * When disconnected, polls every 15s.
 */
export function useNotifications(filters: NotificationFilters = {}) {
  const connected = useIsSocketConnected()

  return useQuery({
    queryKey: NOTIFICATION_KEYS.list(filters),
    queryFn: async (): Promise<NotificationsResponse> => {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined),
      )
      const { data } = await api.get('/notifications', { params })
      return { data: data.data, meta: data.meta }
    },
    refetchInterval: connected ? 120_000 : 15_000,
    staleTime: 10_000,
  })
}

/**
 * Get unread notification count.
 * Updated in real-time via WebSocket — polling is a fallback only.
 */
export function useUnreadCount() {
  const connected = useIsSocketConnected()

  return useQuery({
    queryKey: NOTIFICATION_KEYS.unreadCount,
    queryFn: async (): Promise<{ count: number }> => {
      const { data } = await api.get('/notifications/unread-count')
      return { count: data.count }
    },
    refetchInterval: connected ? 120_000 : 15_000,
    staleTime: 30_000,
  })
}

// ─── Mutations with optimistic updates ──────────────────────────────────────

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/notifications/${notificationId}/read`)
    },
    onMutate: async (notificationId) => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_KEYS.all })
      await qc.cancelQueries({ queryKey: NOTIFICATION_KEYS.unreadCount })

      const prevCount = qc.getQueryData<{ count: number }>(NOTIFICATION_KEYS.unreadCount)

      // Optimistically decrement unread count
      qc.setQueryData<{ count: number }>(NOTIFICATION_KEYS.unreadCount, (old) =>
        old ? { count: Math.max(0, old.count - 1) } : old,
      )

      // Optimistically mark as read in all cached lists
      qc.setQueriesData<NotificationsResponse>(
        { queryKey: NOTIFICATION_KEYS.all },
        (old) => {
          if (!old) return old
          return {
            ...old,
            data: old.data.map((n) =>
              n.id === notificationId ? { ...n, read: true } : n,
            ),
            meta: { ...old.meta, unreadCount: Math.max(0, old.meta.unreadCount - 1) },
          }
        },
      )

      return { prevCount }
    },
    onError: (_err, _id, context) => {
      if (context?.prevCount) {
        qc.setQueryData(NOTIFICATION_KEYS.unreadCount, context.prevCount)
      }
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
      toast('Failed to mark notification as read', 'error')
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_KEYS.all })
      await qc.cancelQueries({ queryKey: NOTIFICATION_KEYS.unreadCount })

      const prevCount = qc.getQueryData<{ count: number }>(NOTIFICATION_KEYS.unreadCount)

      qc.setQueryData<{ count: number }>(NOTIFICATION_KEYS.unreadCount, { count: 0 })
      qc.setQueriesData<NotificationsResponse>(
        { queryKey: NOTIFICATION_KEYS.all },
        (old) => {
          if (!old) return old
          return {
            ...old,
            data: old.data.map((n) => ({ ...n, read: true })),
            meta: { ...old.meta, unreadCount: 0 },
          }
        },
      )

      return { prevCount }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevCount) {
        qc.setQueryData(NOTIFICATION_KEYS.unreadCount, context.prevCount)
      }
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
      toast('Failed to mark all notifications as read', 'error')
    },
    onSuccess: () => {
      toast('All notifications marked as read')
    },
  })
}

// ─── WebSocket integration hook (call once in AppLayout) ────────────────────

/**
 * Central WebSocket subscription for all notification events.
 * Keeps React Query caches in sync across all open tabs/devices.
 */
export function useNotificationSocket() {
  const qc = useQueryClient()

  const handleNewNotification = useCallback(
    (notification: Notification & { title?: string }) => {
      // Prepend to cached lists (deduplicate)
      qc.setQueriesData<NotificationsResponse>(
        { queryKey: NOTIFICATION_KEYS.all },
        (old) => {
          if (!old) return old
          if (old.data.some((n) => n.id === notification.id)) return old
          return {
            ...old,
            data: [{ ...notification, read: false }, ...old.data],
            meta: { ...old.meta, total: old.meta.total + 1, unreadCount: old.meta.unreadCount + 1 },
          }
        },
      )

      // Increment unread count
      qc.setQueryData<{ count: number }>(NOTIFICATION_KEYS.unreadCount, (old) =>
        old ? { count: old.count + 1 } : { count: 1 },
      )

      if (notification.title) {
        toast(notification.title, 'info')
      }
    },
    [qc],
  )

  const handleCountUpdate = useCallback(
    (data: { count: number }) => {
      qc.setQueryData<{ count: number }>(NOTIFICATION_KEYS.unreadCount, { count: data.count })
    },
    [qc],
  )

  const handleNotificationRead = useCallback(
    (data: { id: string }) => {
      // Cross-tab sync: another session marked this notification as read
      qc.setQueriesData<NotificationsResponse>(
        { queryKey: NOTIFICATION_KEYS.all },
        (old) => {
          if (!old) return old
          const target = old.data.find((n) => n.id === data.id)
          if (!target || target.read) return old
          return {
            ...old,
            data: old.data.map((n) => (n.id === data.id ? { ...n, read: true } : n)),
            meta: { ...old.meta, unreadCount: Math.max(0, old.meta.unreadCount - 1) },
          }
        },
      )
    },
    [qc],
  )

  const handleAllRead = useCallback(
    () => {
      // Cross-tab sync: another session marked all as read
      qc.setQueryData<{ count: number }>(NOTIFICATION_KEYS.unreadCount, { count: 0 })
      qc.setQueriesData<NotificationsResponse>(
        { queryKey: NOTIFICATION_KEYS.all },
        (old) => {
          if (!old) return old
          return {
            ...old,
            data: old.data.map((n) => ({ ...n, read: true })),
            meta: { ...old.meta, unreadCount: 0 },
          }
        },
      )
    },
    [qc],
  )

  useEffect(() => {
    const socket = getSocket()

    socket.on('notification:new', handleNewNotification)
    socket.on('notification:count', handleCountUpdate)
    socket.on('notification:read', handleNotificationRead)
    socket.on('notification:all-read', handleAllRead)

    // On reconnect, refetch to catch anything missed while disconnected
    const handleReconnect = () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unreadCount })
    }
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('notification:new', handleNewNotification)
      socket.off('notification:count', handleCountUpdate)
      socket.off('notification:read', handleNotificationRead)
      socket.off('notification:all-read', handleAllRead)
      socket.off('connect', handleReconnect)
    }
  }, [qc, handleNewNotification, handleCountUpdate, handleNotificationRead, handleAllRead])
}
