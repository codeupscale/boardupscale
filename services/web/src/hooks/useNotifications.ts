import { useEffect, useCallback, useSyncExternalStore, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { getSocket, getSocketStatus, onSocketStatus } from '@/lib/socket'
import { toast } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { playNotificationSound } from '@/lib/notification-sound'
import { claimNotificationAlert } from '@/lib/notification-tab-coordinator'
import type { Notification } from '@/types'

export type NotificationFilter = 'all' | 'unread' | 'mentions' | 'assigned'

export const NOTIFICATION_KEYS = {
  all: ['notifications'] as const,
  list: (organizationId: string | undefined, filters: NotificationFilters) =>
    ['notifications', organizationId, filters] as const,
  unreadCount: (organizationId: string | undefined) =>
    ['notifications-unread-count', organizationId] as const,
  preferences: ['notification-preferences'] as const,
}

interface NotificationFilters {
  page?: number
  limit?: number
  filter?: NotificationFilter
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

export interface NotificationPreferences {
  email: boolean
  inApp: boolean
  sound: boolean
}

function subscribeToStatus(cb: () => void) {
  return onSocketStatus(cb)
}

function useIsSocketConnected(): boolean {
  return useSyncExternalStore(subscribeToStatus, getSocketStatus) === 'connected'
}

function useActiveOrganizationId() {
  return useAuthStore((s) => s.user?.organizationId)
}

/**
 * Fetch paginated notifications for the active organization.
 */
export function useNotifications(filters: NotificationFilters = {}) {
  const connected = useIsSocketConnected()
  const organizationId = useActiveOrganizationId()

  return useQuery({
    queryKey: NOTIFICATION_KEYS.list(organizationId, filters),
    queryFn: async (): Promise<NotificationsResponse> => {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined),
      )
      const { data } = await api.get('/notifications', { params })
      return { data: data.data, meta: data.meta }
    },
    enabled: !!organizationId,
    refetchInterval: connected ? 120_000 : 15_000,
    staleTime: 10_000,
  })
}

export function useUnreadCount() {
  const connected = useIsSocketConnected()
  const organizationId = useActiveOrganizationId()

  return useQuery({
    queryKey: NOTIFICATION_KEYS.unreadCount(organizationId),
    queryFn: async (): Promise<{ count: number; organizationId?: string }> => {
      const { data } = await api.get('/notifications/unread-count')
      return { count: data.count, organizationId: data.organizationId }
    },
    enabled: !!organizationId,
    refetchInterval: connected ? 120_000 : 15_000,
    staleTime: 30_000,
  })
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.preferences,
    queryFn: async (): Promise<NotificationPreferences> => {
      const { data } = await api.get('/notifications/preferences')
      // TransformInterceptor wraps as { data: prefs }
      return data.data as NotificationPreferences
    },
    staleTime: 60_000,
  })
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      const { data } = await api.patch('/notifications/preferences', prefs)
      return data.data as NotificationPreferences
    },
    onMutate: async (prefs) => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_KEYS.preferences })
      const previous = qc.getQueryData<NotificationPreferences>(
        NOTIFICATION_KEYS.preferences,
      )
      qc.setQueryData<NotificationPreferences>(NOTIFICATION_KEYS.preferences, (old) => ({
        email: old?.email ?? true,
        inApp: old?.inApp ?? true,
        sound: old?.sound ?? true,
        ...prefs,
      }))
      return { previous }
    },
    onError: (_err, _prefs, context) => {
      if (context?.previous) {
        qc.setQueryData(NOTIFICATION_KEYS.preferences, context.previous)
      }
      toast('Failed to save preferences', 'error')
    },
    onSuccess: (data) => {
      qc.setQueryData(NOTIFICATION_KEYS.preferences, data)
    },
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  const organizationId = useActiveOrganizationId()
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/notifications/${notificationId}/read`)
    },
    onMutate: async (notificationId) => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_KEYS.all })
      const unreadKey = NOTIFICATION_KEYS.unreadCount(organizationId)
      await qc.cancelQueries({ queryKey: unreadKey })

      const prevCount = qc.getQueryData<{ count: number }>(unreadKey)

      qc.setQueryData<{ count: number }>(unreadKey, (old) =>
        old ? { count: Math.max(0, old.count - 1) } : old,
      )

      qc.setQueriesData<NotificationsResponse>({ queryKey: NOTIFICATION_KEYS.all }, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
          meta: { ...old.meta, unreadCount: Math.max(0, old.meta.unreadCount - 1) },
        }
      })

      return { prevCount, unreadKey }
    },
    onError: (_err, _id, context) => {
      if (context?.prevCount && context.unreadKey) {
        qc.setQueryData(context.unreadKey, context.prevCount)
      }
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
      toast('Failed to mark notification as read', 'error')
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  const organizationId = useActiveOrganizationId()
  return useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_KEYS.all })
      const unreadKey = NOTIFICATION_KEYS.unreadCount(organizationId)
      await qc.cancelQueries({ queryKey: unreadKey })

      const prevCount = qc.getQueryData<{ count: number }>(unreadKey)

      qc.setQueryData<{ count: number }>(unreadKey, { count: 0 })
      qc.setQueriesData<NotificationsResponse>({ queryKey: NOTIFICATION_KEYS.all }, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((n) => ({ ...n, read: true })),
          meta: { ...old.meta, unreadCount: 0 },
        }
      })

      return { prevCount, unreadKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.prevCount && context.unreadKey) {
        qc.setQueryData(context.unreadKey, context.prevCount)
      }
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
      toast('Failed to mark all notifications as read', 'error')
    },
    onSuccess: () => {
      toast('All notifications marked as read')
    },
  })
}

/**
 * Central WebSocket subscription for notification events.
 * Org-scoped: ignores events for other workspaces.
 * Sound: only when tab visible + sound preference on.
 * Actor never receives their own events (backend filters).
 */
export function useNotificationSocket() {
  const qc = useQueryClient()
  const organizationId = useActiveOrganizationId()
  const organizationIdRef = useRef(organizationId)
  organizationIdRef.current = organizationId

  const { data: prefs } = useNotificationPreferences()
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const matchesActiveOrg = useCallback((payloadOrgId?: string | null) => {
    const active = organizationIdRef.current
    if (!active) return false
    if (!payloadOrgId) return false
    return payloadOrgId === active
  }, [])

  const handleNewNotification = useCallback(
    (
      notification: Notification & {
        title?: string
        organizationId?: string
      },
    ) => {
      const orgId =
        notification.organizationId ||
        notification.data?.organizationId ||
        null
      if (!matchesActiveOrg(orgId)) return

      // All tabs update inbox/badge. Only one tab plays toast + sound.
      qc.setQueriesData<NotificationsResponse>(
        { queryKey: NOTIFICATION_KEYS.all },
        (old) => {
          if (!old) return old
          if (old.data.some((n) => n.id === notification.id)) return old
          return {
            ...old,
            data: [{ ...notification, read: false }, ...old.data].slice(0, 50),
            meta: {
              ...old.meta,
              total: old.meta.total + 1,
              unreadCount: old.meta.unreadCount + 1,
            },
          }
        },
      )

      qc.setQueryData<{ count: number }>(
        NOTIFICATION_KEYS.unreadCount(organizationIdRef.current),
        (old) => (old ? { count: old.count + 1 } : { count: 1 }),
      )

      const shouldAlert = claimNotificationAlert(notification.id)
      if (!shouldAlert) return

      if (notification.title) {
        toast(notification.title, 'info')
      }

      const soundOn = prefsRef.current?.sound !== false
      void playNotificationSound(soundOn, {
        type: notification.type,
        data: notification.data,
      })
    },
    [qc, matchesActiveOrg],
  )

  const handleCountUpdate = useCallback(
    (data: { count: number; organizationId?: string }) => {
      if (!matchesActiveOrg(data.organizationId)) return
      qc.setQueryData<{ count: number }>(
        NOTIFICATION_KEYS.unreadCount(organizationIdRef.current),
        { count: data.count },
      )
    },
    [qc, matchesActiveOrg],
  )

  const handleCountIncrement = useCallback(
    (data: { organizationId?: string }) => {
      if (!matchesActiveOrg(data.organizationId)) return
      qc.setQueryData<{ count: number }>(
        NOTIFICATION_KEYS.unreadCount(organizationIdRef.current),
        (old) => (old ? { count: old.count + 1 } : { count: 1 }),
      )
    },
    [qc, matchesActiveOrg],
  )

  const handleNotificationRead = useCallback(
    (data: { id: string; organizationId?: string }) => {
      if (!matchesActiveOrg(data.organizationId)) return
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
    [qc, matchesActiveOrg],
  )

  const handleAllRead = useCallback(
    (data?: { organizationId?: string }) => {
      if (data?.organizationId && !matchesActiveOrg(data.organizationId)) return
      qc.setQueryData<{ count: number }>(
        NOTIFICATION_KEYS.unreadCount(organizationIdRef.current),
        { count: 0 },
      )
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
    [qc, matchesActiveOrg],
  )

  // Invalidate when org switches
  useEffect(() => {
    if (!organizationId) return
    qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
    qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unreadCount(organizationId) })
  }, [organizationId, qc])

  useEffect(() => {
    const socket = getSocket()

    socket.on('notification:new', handleNewNotification)
    socket.on('notification:count', handleCountUpdate)
    socket.on('notification:count-increment', handleCountIncrement)
    socket.on('notification:read', handleNotificationRead)
    socket.on('notification:all-read', handleAllRead)

    const handleReconnect = () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
      qc.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.unreadCount(organizationIdRef.current),
      })
    }
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('notification:new', handleNewNotification)
      socket.off('notification:count', handleCountUpdate)
      socket.off('notification:count-increment', handleCountIncrement)
      socket.off('notification:read', handleNotificationRead)
      socket.off('notification:all-read', handleAllRead)
      socket.off('connect', handleReconnect)
    }
  }, [
    qc,
    handleNewNotification,
    handleCountUpdate,
    handleCountIncrement,
    handleNotificationRead,
    handleAllRead,
  ])
}
