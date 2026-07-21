import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Bell, CheckCheck, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useNotificationsPanelStore } from '@/store/notifications.store'
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/hooks/useNotifications'
import type { Notification } from '@/types'
import { cn } from '@/lib/utils'
import {
  getNotificationLink,
  groupNotificationsByDay,
  isCommentNotification,
} from './notification-utils'
import { NotificationRow } from './NotificationRow'
import { CommentNotificationRow } from './CommentNotificationRow'

type FilterTab = 'all' | 'unread' | 'mentions' | 'assigned'

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

export function NotificationsPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isOpen = useNotificationsPanelStore((s) => s.isOpen)
  const setOpen = useNotificationsPanelStore((s) => s.setOpen)
  const [filter, setFilter] = useState<FilterTab>('all')

  const { data, isLoading } = useNotifications({ filter, limit: 40 })
  const { data: unreadData } = useUnreadCount()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  const notifications = data?.data ?? []
  const unreadCount = unreadData?.count ?? data?.meta?.unreadCount ?? 0
  const groups = useMemo(() => groupNotificationsByDay(notifications), [notifications])

  const tabs: { id: FilterTab; label: string }[] = [
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
    setOpen(false)
    if (link) navigate(link)
  }

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="px-4 py-3 border-b border-border space-y-0">
          <div className="flex items-center justify-between pr-8">
            <SheetTitle className="text-base">{t('notifications.title')}</SheetTitle>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  isLoading={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t('notifications.markAllRead')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Notification settings"
                onClick={() => {
                  setOpen(false)
                  navigate('/settings?tab=notifications')
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                filter === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="p-4">
              <ListSkeleton rows={6} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Bell className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t('notifications.noNotifications')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {t('notifications.noNotificationsDesc')}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="px-4 py-2 bg-muted/60 border-y border-border sticky top-0 z-10">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {group.items.map((n) => (
                    <NotificationListItem key={n.id} notification={n} onSelect={handleSelect} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            {t('notifications.viewAll')}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
