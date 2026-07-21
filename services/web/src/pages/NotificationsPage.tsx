import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Inbox, BellRing } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  useUnreadCount,
  type NotificationFilter,
} from '@/hooks/useNotifications'
import { Notification } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  getNotificationLink,
  groupNotificationsByDay,
  isCommentNotification,
} from '@/components/notifications/notification-utils'
import { NotificationRow } from '@/components/notifications/NotificationRow'
import { CommentNotificationRow } from '@/components/notifications/CommentNotificationRow'

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function NotificationListItem({
  notification,
  onSelect,
}: {
  notification: Notification
  onSelect: (n: Notification) => void
}) {
  if (isCommentNotification(notification.type)) {
    return <CommentNotificationRow notification={notification} onSelect={onSelect} />
  }
  return <NotificationRow notification={notification} onSelect={onSelect} />
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const { data: notificationsResult, isLoading } = useNotifications({ filter, limit: 50 })
  const { data: unreadData } = useUnreadCount()
  const notifications = notificationsResult?.data
  const unreadCount =
    unreadData?.count ??
    notificationsResult?.meta?.unreadCount ??
    notifications?.filter((n) => !n.read).length ??
    0
  const totalCount = notificationsResult?.meta?.total ?? notifications?.length ?? 0
  const readCount = Math.max(0, totalCount - unreadCount)
  const markAllRead = useMarkAllRead()
  const markRead = useMarkRead()
  const groups = useMemo(
    () => groupNotificationsByDay(notifications ?? []),
    [notifications],
  )

  const tabs: { id: NotificationFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: unreadCount > 0 ? `Unread ${unreadCount}` : 'Unread' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'assigned', label: 'Assigned' },
  ]

  const handleSelect = (notification: Notification) => {
    if (!notification.read) {
      markRead.mutate(notification.id)
    }
    const link = getNotificationLink(notification)
    if (link) navigate(link)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('notifications.title')}
        subtitle="Stay updated on your projects and issues"
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

      <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<Inbox className="h-5 w-5 text-primary" />}
            label="Total Notifications"
            value={totalCount}
            color="bg-primary/10"
          />
          <StatCard
            icon={<BellRing className="h-5 w-5 text-amber-600" />}
            label="Unread"
            value={unreadCount}
            color="bg-amber-50 dark:bg-amber-900/20"
          />
          <StatCard
            icon={<CheckCheck className="h-5 w-5 text-emerald-600" />}
            label="Read"
            value={readCount}
            color="bg-emerald-50 dark:bg-emerald-900/20"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                filter === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : !notifications || notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
              <Bell className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('notifications.noNotifications')}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t('notifications.noNotificationsDesc')}
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-5 py-3 bg-muted border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {group.items.map((notification) => (
                    <NotificationListItem
                      key={notification.id}
                      notification={notification}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
