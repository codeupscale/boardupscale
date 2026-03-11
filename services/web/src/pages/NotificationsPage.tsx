import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, MessageCircle, GitMerge, AlertCircle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from '@/hooks/useNotifications'
import { Notification } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

function getNotificationIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    comment: <MessageCircle className="h-5 w-5 text-blue-500" />,
    mention: <Bell className="h-5 w-5 text-purple-500" />,
    assigned: <GitMerge className="h-5 w-5 text-green-500" />,
    status_changed: <AlertCircle className="h-5 w-5 text-yellow-500" />,
    sprint_started: <Info className="h-5 w-5 text-blue-500" />,
    sprint_completed: <CheckCheck className="h-5 w-5 text-green-500" />,
  }
  return map[type] || <Bell className="h-5 w-5 text-gray-400" />
}

function getNotificationLink(notification: Notification): string | null {
  const data = notification.data || {}
  if (data.issueId) return `/issues/${data.issueId}`
  if (data.projectId) return `/projects/${data.projectId}/board`
  return null
}

function NotificationItem({ notification }: { notification: Notification }) {
  const navigate = useNavigate()
  const markRead = useMarkRead()
  const link = getNotificationLink(notification)

  const handleClick = () => {
    if (!notification.read) {
      markRead.mutate(notification.id)
    }
    if (link) {
      navigate(link)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-4 px-6 py-4 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500',
        !notification.read && 'bg-blue-50 border-l-4 border-l-blue-500',
        notification.read && 'hover:bg-gray-50',
        link && 'cursor-pointer',
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        {getNotificationIcon(notification.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', !notification.read ? 'font-semibold text-gray-900' : 'text-gray-700')}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">{formatRelativeTime(notification.createdAt)}</p>
      </div>
      {!notification.read && (
        <div className="flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />
        </div>
      )}
    </button>
  )
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const { data: notifications, isLoading } = useNotifications()
  const markAllRead = useMarkAllRead()

  const unreadCount = notifications?.filter((n) => !n.read).length || 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('notifications.title')}
        actions={
          unreadCount > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              isLoading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="h-4 w-4" />
              {t('notifications.markAllRead')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingPage />
        ) : !notifications || notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-12 w-12" />}
            title={t('notifications.noNotifications')}
            description={t('notifications.noNotificationsDesc')}
          />
        ) : (
          <div className="bg-white divide-y divide-gray-100 max-w-3xl">
            {/* Unread section */}
            {unreadCount > 0 && (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('notifications.unread', { count: unreadCount })}
                </p>
              </div>
            )}
            {notifications
              .filter((n) => !n.read)
              .map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}

            {/* Read section */}
            {notifications.some((n) => n.read) && (
              <>
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('notifications.earlier')}
                  </p>
                </div>
                {notifications
                  .filter((n) => n.read)
                  .map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
