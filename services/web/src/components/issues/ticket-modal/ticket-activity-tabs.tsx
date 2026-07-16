import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { User } from '@/types'
import { useAuthStore } from '@/store/auth.store'
import { useComments, useCreateComment } from '@/hooks/useComments'
import { ActivityList } from '@/components/issues/activity-list'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  RICH_TEXT_ISSUE_CONTENT_MIN_HEIGHT,
  RICH_TEXT_ISSUE_EDITOR_MAX_HEIGHT,
} from '@/components/ui/rich-text-display'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TicketCommentItem } from './ticket-comment-item'
import { hasRichTextContent } from './ticket-modal.utils'
import { ticketModalTokens } from './ticket-modal.tokens'

type ActivityTab = 'comments' | 'history'

interface TicketActivityTabsProps {
  issueId: string
  projectId?: string
  users?: User[]
  canModifyAnyComment?: boolean
}

export function TicketActivityTabs({
  issueId,
  projectId,
  users = [],
  canModifyAnyComment = false,
}: TicketActivityTabsProps) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<ActivityTab>('comments')
  const [commentText, setCommentText] = useState('')
  const { data: comments, isLoading: commentsLoading } = useComments(issueId)
  const createComment = useCreateComment()

  const tabs: Array<{ key: ActivityTab; label: string; count?: number; hint?: string }> = [
    { key: 'comments', label: t('issues.comments'), count: comments?.length },
    {
      key: 'history',
      label: t('issues.historyTab', 'History'),
      hint: t(
        'issues.historyTabHint',
        'Complete audit log — field changes, comments, attachments, work logs, and links.',
      ),
    },
  ]

  const handleAddComment = () => {
    if (!hasRichTextContent(commentText) || createComment.isPending) return
    createComment.mutate(
      { issueId, content: commentText },
      {
        onSuccess: () => setCommentText(''),
      },
    )
  }

  return (
    <div className={cn('mt-6 rounded-xl border border-border overflow-hidden', ticketModalTokens.fieldSurface)}>
      <div className="flex items-center gap-0 border-b border-border">
        {tabs.map(({ key, label, count }) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={cn(
                'relative px-4 py-3 text-sm font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {count != null && count > 0 && (
                <span
                  className={cn(
                    'ml-1.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5',
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
              )}
            </button>
          )
        })}
      </div>

      <div className="p-4">
        {activeTab === 'comments' && (
          <>
            <div className="flex gap-3 mb-5 pb-4 border-b border-border">
              <Avatar user={currentUser || undefined} size="sm" />
              <div className="flex-1 space-y-2">
                <RichTextEditor
                  placeholder={t('issues.addCommentPlaceholder')}
                  value={commentText}
                  onChange={setCommentText}
                  users={users}
                  minHeight={RICH_TEXT_ISSUE_CONTENT_MIN_HEIGHT}
                  maxHeight={RICH_TEXT_ISSUE_EDITOR_MAX_HEIGHT}
                  // Upload under project only — comment create binds issueId+commentId.
                  // Never pass issueId here or drafts appear in ticket attachments.
                  projectId={projectId}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    isLoading={createComment.isPending}
                    disabled={!hasRichTextContent(commentText)}
                    aria-disabled={!hasRichTextContent(commentText)}
                  >
                    {t('issues.addComment')}
                  </Button>
                </div>
              </div>
            </div>

            {commentsLoading ? (
              <ListSkeleton rows={3} />
            ) : comments && comments.length > 0 ? (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <TicketCommentItem
                    key={comment.id}
                    comment={comment}
                    currentUserId={currentUser?.id}
                    canModifyAny={canModifyAnyComment}
                    users={users}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t('issues.noComments')}</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            <p className="text-xs text-muted-foreground mb-4">{tabs[1].hint}</p>
            <ActivityList issueId={issueId} />
          </>
        )}
      </div>
    </div>
  )
}
