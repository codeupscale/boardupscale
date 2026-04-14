import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, MessageCircle, GitMerge, AlertCircle, Info, Inbox, BellRing, Clock, Zap, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from '@/hooks/useNotifications'
import { Notification } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

/**
 * Map backend notification types to icons.
 * Backend sends: issue:assigned, comment:created, mention, issue:status_changed,
 * sprint:started, sprint:completed, issue:due_soon, automation:notification
 */
function getNotificationIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    // Backend types (namespaced with colon)
    'comment:created':          <MessageCircle className="h-4 w-4 text-primary" />,
    'mention':                  <BellRing className="h-4 w-4 text-purple-600" />,
    'issue:assigned':           <UserPlus className="h-4 w-4 text-emerald-600" />,
    'issue:status_changed':     <AlertCircle className="h-4 w-4 text-amber-600" />,
    'sprint:started':           <Info className="h-4 w-4 text-primary" />,
    'sprint:completed':         <CheckCheck className="h-4 w-4 text-emerald-600" />,
    'issue:due_soon':           <Clock className="h-4 w-4 text-red-600" />,
    'automation:notification':  <Zap className="h-4 w-4 text-indigo-600" />,
    // Legacy short types (backwards-compatible)
    'comment':                  <MessageCircle className="h-4 w-4 text-primary" />,
    'assigned':                 <UserPlus className="h-4 w-4 text-emerald-600" />,
    'status_changed':           <AlertCircle className="h-4 w-4 text-amber-600" />,
    'sprint_started':           <Info className="h-4 w-4 text-primary" />,
    'sprint_completed':         <CheckCheck className="h-4 w-4 text-emerald-600" />,
  }
  return map[type] || <Bell className="h-4 w-4 text-muted-foreground" />
}

function getNotificationIconBg(type: string) {
  const map: Record<string, string> = {
    'comment:created':          'bg-primary/10',
    'mention':                  'bg-purple-50 dark:bg-purple-900/20',
    'issue:assigned':           'bg-emerald-50 dark:bg-emerald-900/20',
    'issue:status_changed':     'bg-amber-50 dark:bg-amber-900/20',
    'sprint:started':           'bg-primary/10',
    'sprint:completed':         'bg-emerald-50 dark:bg-emerald-900/20',
    'issue:due_soon':           'bg-red-50 dark:bg-red-900/20',
    'automation:notification':  'bg-indigo-50 dark:bg-indigo-900/20',
    // Legacy short types
    'comment':                  'bg-primary/10',
    'assigned':                 'bg-emerald-50 dark:bg-emerald-900/20',
    'status_changed':           'bg-amber-50 dark:bg-amber-900/20',
    'sprint_started':           'bg-primary/10',
    'sprint_completed':         'bg-emerald-50 dark:bg-emerald-900/20',
  }
  return map[type] || 'bg-muted'
}

function getNotificationLink(notification: Notification): string | null {
  const data = notification.data || {}
  if (data.issueId) return `/issues/${data.issueId}`
  if (data.projectId) return `/projects/${data.projectId}/board`
  return null
}

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
        <p className="text-2xl font-bold text-foreground">
          {value}
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
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
        'w-full flex items-start gap-4 px-5 py-4 transition-colors text-left',
        'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring',
        !notification.read && 'bg-primary/5 dark:bg-primary/10',
        'hover:bg-accent/50',
        link && 'cursor-pointer',
      )}
    >
      <div className={cn(
        'flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-0.5',
        getNotificationIconBg(notification.type),
      )}>
        {getNotificationIcon(notification.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', !notification.read ? 'font-semibold text-foreground' : 'text-foreground')}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(notification.createdAt)}</p>
      </div>
      {!notification.read && (
        <div className="flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary mt-2" />
        </div>
      )}
    </button>
  )
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const { data: notificationsResult, isLoading } = useNotifications()
  const notifications = notificationsResult?.data
  const unreadCount = notificationsResult?.meta?.unreadCount ?? notifications?.filter((n) => !n.read).length ?? 0
  const readCount = notifications?.filter((n) => n.read).length ?? 0
  const totalCount = notifications?.length ?? 0
  const markAllRead = useMarkAllRead()

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

      <div className="p-6 space-y-6">
        {/* Stats */}
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

        {/* Content */}
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
            {/* Unread section */}
            {unreadCount > 0 && (
              <>
                <div className="px-5 py-3 bg-muted border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('notifications.unread', { count: unreadCount })}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {notifications
                    .filter((n) => !n.read)
                    .map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                </div>
              </>
            )}

            {/* Read section */}
            {notifications.some((n) => n.read) && (
              <>
                <div className="px-5 py-3 bg-muted border-b border-border border-t border-t-gray-200 dark:border-t-gray-700">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('notifications.earlier')}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {notifications
                    .filter((n) => n.read)
                    .map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
