import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Comment, User } from '@/types'
import { useUpdateComment, useDeleteComment } from '@/hooks/useComments'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  RICH_TEXT_ISSUE_CONTENT_MIN_HEIGHT,
  RICH_TEXT_ISSUE_EDITOR_MAX_HEIGHT,
  RICH_TEXT_ISSUE_CONTENT_MAX_HEIGHT,
} from '@/components/ui/rich-text-display'
import { RichTextDisplay } from '@/components/ui/rich-text-display'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils'

interface TicketCommentItemProps {
  comment: Comment
  currentUserId?: string
  canModifyAny?: boolean
  users?: User[]
}

export function TicketCommentItem({
  comment,
  currentUserId,
  canModifyAny,
  users = [],
}: TicketCommentItemProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [showDelete, setShowDelete] = useState(false)
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()

  return (
    <div className="flex gap-3 group">
      <Avatar user={comment.author} size="sm" />
      <div className="flex-1 min-w-0 rounded-xl bg-card/60 border border-border p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-foreground">
            {comment.author?.displayName || 'Unknown'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.editedAt && (
            <span className="text-xs text-muted-foreground italic">{t('issues.edited')}</span>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <RichTextEditor
              value={editContent}
              onChange={setEditContent}
              users={users}
              minHeight={RICH_TEXT_ISSUE_CONTENT_MIN_HEIGHT}
              maxHeight={RICH_TEXT_ISSUE_EDITOR_MAX_HEIGHT}
              autoFocus
              issueId={comment.issueId}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                isLoading={updateComment.isPending}
                onClick={() =>
                  updateComment.mutate(
                    { issueId: comment.issueId, commentId: comment.id, content: editContent },
                    { onSuccess: () => setEditing(false) },
                  )
                }
              >
                {t('common.save')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <RichTextDisplay
            content={comment.content}
            className="text-sm text-foreground"
            maxHeight={RICH_TEXT_ISSUE_CONTENT_MAX_HEIGHT}
          />
        )}
        {(currentUserId === comment.authorId || canModifyAny) && !editing && (
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-primary font-medium transition-colors"
              onClick={() => {
                setEditContent(comment.content)
                setEditing(true)
              }}
            >
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-red-500 font-medium transition-colors"
              onClick={() => setShowDelete(true)}
            >
              {t('common.delete')}
            </button>
          </div>
        )}
        <ConfirmDialog
          open={showDelete}
          onClose={() => setShowDelete(false)}
          onConfirm={() =>
            deleteComment.mutate(
              { issueId: comment.issueId, commentId: comment.id },
              { onSuccess: () => setShowDelete(false) },
            )
          }
          title={`${t('common.delete')} ${t('issues.comment')}`}
          description={t('issues.deleteConfirm')}
          confirmLabel={t('common.delete')}
          destructive
          isLoading={deleteComment.isPending}
        />
      </div>
    </div>
  )
}
