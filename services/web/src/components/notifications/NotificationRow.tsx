import type { Notification } from '@/types'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  getNotificationIcon,
  getNotificationIconBg,
  getNotificationLink,
  notificationItemClass,
} from './notification-utils'

export function NotificationRow({
  notification,
  onSelect,
}: {
  notification: Notification
  onSelect: (n: Notification) => void
}) {
  const link = getNotificationLink(notification)
  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={notificationItemClass(notification.read, !!link)}
    >
      <div
        className={cn(
          'flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-0.5',
          getNotificationIconBg(notification.type),
        )}
      >
        {getNotificationIcon(notification.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm',
            !notification.read ? 'font-semibold text-foreground' : 'text-foreground',
          )}
        >
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.read && (
        <div className="flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary mt-2" />
        </div>
      )}
    </button>
  )
}
