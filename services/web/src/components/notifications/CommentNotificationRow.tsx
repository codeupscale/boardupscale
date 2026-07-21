import { useState } from 'react'
import { ChevronDown, ChevronUp, Ticket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Notification } from '@/types'
import { useComment } from '@/hooks/useComments'
import { RichTextDisplay } from '@/components/ui/rich-text-display'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  getCommentActorName,
  getCommentIssueKey,
  getCommentIssueTitle,
  getCommentNotificationData,
  getCommentNotificationSummary,
  getNotificationLink,
} from './notification-utils'

function CommentPreviewPanel({
  commentId,
  fallbackBody,
  actorName,
  createdAt,
  enabled,
}: {
  commentId: string
  fallbackBody?: string
  actorName: string | null
  createdAt: string
  enabled: boolean
}) {
  const { t } = useTranslation()
  const { data: comment, isLoading, isError, refetch, isFetching } = useComment(commentId, enabled)

  const previewTime = comment?.createdAt ?? createdAt
  const previewActor = comment?.author?.displayName ?? actorName ?? t('common.unknownUser')

  // Keep cached content visible during collapse animation.
  const showPanel = enabled || !!comment || isLoading

  if (!showPanel) {
    return <div className="min-h-0" aria-hidden />
  }

  if (enabled && isLoading) {
    return (
      <div
        className="rounded-lg border border-border/60 bg-muted/50 px-3 py-3 space-y-2 animate-pulse"
        aria-busy="true"
      >
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-4/5" />
        <div className="h-2.5 bg-muted rounded w-1/3 mt-3" />
      </div>
    )
  }

  const content = !isError && comment ? comment.content : fallbackBody

  if (!content) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/50 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t('notifications.commentUnavailable')}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs shrink-0"
            isLoading={isFetching}
            onClick={() => refetch()}
          >
            {t('notifications.retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/50 px-3 py-3">
      <RichTextDisplay
        content={content}
        maxHeight={140}
        className="text-sm text-foreground/90 leading-relaxed"
      />
      <p className="text-[11px] text-muted-foreground mt-2.5 pt-2 border-t border-border/40">
        {t('notifications.commentedBy', {
          actor: previewActor,
          time: formatRelativeTime(previewTime),
        })}
      </p>
    </div>
  )
}

export function CommentNotificationRow({
  notification,
  onSelect,
}: {
  notification: Notification
  onSelect: (n: Notification) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const link = getNotificationLink(notification)
  const commentData = getCommentNotificationData(notification)
  const issueKey = getCommentIssueKey(notification)
  const issueTitle = getCommentIssueTitle(notification)
  const actorName = getCommentActorName(notification)
  const summary = getCommentNotificationSummary(notification, t)
  const canExpand = !!commentData?.commentId

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((prev) => !prev)
  }

  return (
    <div
      className={cn(
        'transition-colors',
        !notification.read && 'bg-primary/[0.03] dark:bg-primary/[0.06]',
        'hover:bg-accent/40',
      )}
    >
      <div className="flex items-start gap-2.5 px-4 py-3">
        {/* Unread dot */}
        <div className="w-2 flex-shrink-0 pt-2">
          {!notification.read && (
            <div className="h-2 w-2 rounded-full bg-primary" aria-hidden />
          )}
        </div>

        {/* Actor avatar */}
        <Avatar name={actorName ?? '?'} size="sm" className="mt-0.5 flex-shrink-0" />

        {/* Summary — click navigates */}
        <button
          type="button"
          onClick={() => onSelect(notification)}
          disabled={!link}
          className={cn(
            'flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring rounded-sm',
            link && 'cursor-pointer',
          )}
        >
          <p
            className={cn(
              'text-sm leading-snug',
              !notification.read ? 'font-semibold text-foreground' : 'text-foreground/90',
            )}
          >
            {summary}
          </p>
          {(issueKey || issueTitle) && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 min-w-0">
              <Ticket className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" aria-hidden />
              <span className="truncate">
                {issueKey}
                {issueKey && issueTitle && (
                  <span className="text-muted-foreground/60 mx-1" aria-hidden>
                    •
                  </span>
                )}
                {issueTitle}
              </span>
            </p>
          )}
        </button>

        {/* Timestamp + chevron */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(notification.createdAt)}
          </span>
          {canExpand && (
            <button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-label={
                expanded ? t('notifications.collapseComment') : t('notifications.expandComment')
              }
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded-md border border-border/70',
                'text-muted-foreground hover:text-foreground hover:bg-accent/80',
                'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring',
                expanded && 'bg-accent/60 text-foreground border-border',
              )}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4 transition-transform duration-200" />
              ) : (
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Smooth expand/collapse preview */}
      {canExpand && (
        <div
          className={cn(
            'grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-in-out',
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div
              className={cn(
                'px-4 pb-3 pl-[3.25rem] motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-in-out',
                expanded ? 'translate-y-0' : '-translate-y-1',
              )}
            >
              <CommentPreviewPanel
                commentId={commentData!.commentId}
                fallbackBody={notification.body}
                actorName={actorName}
                createdAt={notification.createdAt}
                enabled={expanded}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
