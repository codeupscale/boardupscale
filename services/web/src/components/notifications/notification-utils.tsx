import {
  Bell,
  BellRing,
  CheckCheck,
  MessageCircle,
  AlertCircle,
  Info,
  Clock,
  Zap,
  UserPlus,
  Calendar,
  FilePlus,
  Trash2,
  FolderPlus,
  FolderMinus,
  Building2,
  Signal,
} from 'lucide-react'
import type { Notification, CommentNotificationData } from '@/types'
import { cn } from '@/lib/utils'

const COMMENT_NOTIFICATION_TYPES = new Set(['comment:created', 'mention'])

export function isCommentNotification(type: string): boolean {
  return COMMENT_NOTIFICATION_TYPES.has(type)
}

export function getCommentNotificationData(
  notification: Notification,
): CommentNotificationData | null {
  const data = notification.data
  if (!data?.issueId || !data?.commentId) return null
  return data as CommentNotificationData
}

export function getCommentIssueKey(notification: Notification): string | null {
  const data = getCommentNotificationData(notification)
  return data?.issueKey ?? null
}

export function getCommentIssueTitle(notification: Notification): string | null {
  const data = getCommentNotificationData(notification)
  if (!data) return null
  return data.issueTitle ?? null
}

export function getCommentActorName(notification: Notification): string | null {
  const data = getCommentNotificationData(notification)
  if (data?.actorDisplayName) return data.actorDisplayName
  return null
}

export function getCommentNotificationSummary(
  notification: Notification,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  const data = getCommentNotificationData(notification)
  const actor = data?.actorDisplayName

  if (actor) {
    if (notification.type === 'mention') {
      return t('notifications.mentionedInComment', { actor })
    }
    return t('notifications.commentedOnTicket', { actor })
  }

  // Legacy notifications created before enriched payload fields.
  return notification.title
}

export function getNotificationIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    'comment:created': <MessageCircle className="h-4 w-4 text-primary" />,
    mention: <BellRing className="h-4 w-4 text-purple-600" />,
    'issue:assigned': <UserPlus className="h-4 w-4 text-emerald-600" />,
    'issue:status_changed': <AlertCircle className="h-4 w-4 text-amber-600" />,
    'issue:priority_changed': <Signal className="h-4 w-4 text-orange-600" />,
    'issue:due_date_changed': <Calendar className="h-4 w-4 text-orange-600" />,
    'issue:created': <FilePlus className="h-4 w-4 text-sky-600" />,
    'issue:deleted': <Trash2 className="h-4 w-4 text-red-600" />,
    'project:created': <FolderPlus className="h-4 w-4 text-sky-600" />,
    'project:deleted': <FolderMinus className="h-4 w-4 text-red-600" />,
    'project:member_added': <UserPlus className="h-4 w-4 text-emerald-600" />,
    'org:member_added': <Building2 className="h-4 w-4 text-emerald-600" />,
    'sprint:started': <Info className="h-4 w-4 text-primary" />,
    'sprint:completed': <CheckCheck className="h-4 w-4 text-emerald-600" />,
    'issue:due_soon': <Clock className="h-4 w-4 text-red-600" />,
    'automation:notification': <Zap className="h-4 w-4 text-indigo-600" />,
  }
  return map[type] || <Bell className="h-4 w-4 text-muted-foreground" />
}

export function getNotificationIconBg(type: string) {
  const map: Record<string, string> = {
    'comment:created': 'bg-primary/10',
    mention: 'bg-purple-50 dark:bg-purple-900/20',
    'issue:assigned': 'bg-emerald-50 dark:bg-emerald-900/20',
    'issue:status_changed': 'bg-amber-50 dark:bg-amber-900/20',
    'issue:priority_changed': 'bg-orange-50 dark:bg-orange-900/20',
    'issue:due_date_changed': 'bg-orange-50 dark:bg-orange-900/20',
    'issue:created': 'bg-sky-50 dark:bg-sky-900/20',
    'issue:deleted': 'bg-red-50 dark:bg-red-900/20',
    'project:created': 'bg-sky-50 dark:bg-sky-900/20',
    'project:deleted': 'bg-red-50 dark:bg-red-900/20',
    'project:member_added': 'bg-emerald-50 dark:bg-emerald-900/20',
    'org:member_added': 'bg-emerald-50 dark:bg-emerald-900/20',
    'sprint:started': 'bg-primary/10',
    'sprint:completed': 'bg-emerald-50 dark:bg-emerald-900/20',
    'issue:due_soon': 'bg-red-50 dark:bg-red-900/20',
    'automation:notification': 'bg-indigo-50 dark:bg-indigo-900/20',
  }
  return map[type] || 'bg-muted'
}

export function getNotificationLink(notification: Notification): string | null {
  const data = notification.data || {}
  if (data.issueId) return `/issues/${data.issueId}`
  if (data.projectId) return `/projects/${data.projectId}/board`
  return null
}

export function groupNotificationsByDay(notifications: Notification[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Earlier', items: [] },
  ]

  for (const n of notifications) {
    const d = new Date(n.createdAt)
    d.setHours(0, 0, 0, 0)
    if (d.getTime() === today.getTime()) groups[0].items.push(n)
    else if (d.getTime() === yesterday.getTime()) groups[1].items.push(n)
    else groups[2].items.push(n)
  }

  return groups.filter((g) => g.items.length > 0)
}

export function notificationItemClass(read: boolean, clickable: boolean) {
  return cn(
    'w-full flex items-start gap-3 px-4 py-3 transition-colors text-left',
    'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring',
    !read && 'bg-primary/5 dark:bg-primary/10',
    'hover:bg-accent/50',
    clickable && 'cursor-pointer',
  )
}
