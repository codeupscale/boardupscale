import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Send, Edit2, Trash2, Clock, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useIssue,
  useUpdateIssue,
  useDeleteIssue,
  useWorkLogs,
  useAddWorkLog,
} from '@/hooks/useIssues'
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from '@/hooks/useComments'
import { useAuthStore } from '@/store/auth.store'
import { useBoard } from '@/hooks/useBoard'
import { useSprints } from '@/hooks/useSprints'
import {
  useCustomFieldDefinitions,
  useIssueCustomFields,
  useSetIssueCustomFields,
} from '@/hooks/useCustomFields'
import { useComponents, useIssueComponents, useSetIssueComponents } from '@/hooks/useComponents'
import { useVersions, useIssueVersions, useSetIssueVersions } from '@/hooks/useVersions'
import { CustomFieldsForm } from '@/components/issues/custom-fields-form'
import {
  IssueType,
  IssuePriority,
  Comment,
} from '@/types'
import { LoadingPage } from '@/components/ui/spinner'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { PriorityBadge } from '@/components/issues/priority-badge'
import { StatusBadge } from '@/components/issues/status-badge'
import { UserSelect } from '@/components/common/user-select'
import { formatDate, formatRelativeTime, formatDuration } from '@/lib/utils'

function CommentItem({
  comment,
  currentUserId,
}: {
  comment: Comment
  currentUserId?: string
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [showDelete, setShowDelete] = useState(false)
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()

  return (
    <div className="flex gap-3">
      <Avatar user={comment.author} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900">
            {comment.author?.displayName || 'Unknown'}
          </span>
          <span className="text-xs text-gray-400">{formatRelativeTime(comment.createdAt)}</span>
          {comment.editedAt && (
            <span className="text-xs text-gray-400">{t('issues.edited')}</span>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
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
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
        )}
        {currentUserId === comment.authorId && !editing && (
          <div className="flex gap-2 mt-1">
            <button
              className="text-xs text-gray-400 hover:text-gray-600"
              onClick={() => {
                setEditContent(comment.content)
                setEditing(true)
              }}
            >
              {t('common.edit')}
            </button>
            <button
              className="text-xs text-gray-400 hover:text-red-600"
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
          title={t('common.delete') + ' ' + t('issues.comment')}
          description={t('issues.deleteConfirm')}
          confirmLabel={t('common.delete')}
          destructive
          isLoading={deleteComment.isPending}
        />
      </div>
    </div>
  )
}

export function IssueDetailPage() {
  const { t } = useTranslation()
  const { id: issueId } = useParams<{ id: string }>()
  const currentUser = useAuthStore((s) => s.user)

  const { data: issue, isLoading } = useIssue(issueId!)
  const { data: comments } = useComments(issueId!)
  const { data: workLogs } = useWorkLogs(issueId!)
  const { data: board } = useBoard(issue?.projectId || '')
  const { data: sprints } = useSprints(issue?.projectId || '')
  const { data: customFieldDefs } = useCustomFieldDefinitions(issue?.projectId || '')
  const { data: customFieldValues } = useIssueCustomFields(issueId!)
  const setCustomFields = useSetIssueCustomFields()
  const { data: projectComponents } = useComponents(issue?.projectId || '')
  const { data: issueComponents } = useIssueComponents(issueId!)
  const setIssueComponents = useSetIssueComponents()
  const { data: projectVersions } = useVersions(issue?.projectId || '')
  const { data: issueVersions } = useIssueVersions(issueId!)
  const setIssueVersions = useSetIssueVersions()

  const updateIssue = useUpdateIssue()
  const deleteIssue = useDeleteIssue()
  const createComment = useCreateComment()
  const addWorkLog = useAddWorkLog()

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [commentText, setCommentText] = useState('')
  const [showWorkLogDialog, setShowWorkLogDialog] = useState(false)
  const [workLogTime, setWorkLogTime] = useState('')
  const [workLogDesc, setWorkLogDesc] = useState('')
  const [showDeleteIssue, setShowDeleteIssue] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [labels, setLabels] = useState<string[]>(issue?.labels || [])

  if (isLoading) return <LoadingPage />
  if (!issue) return <div className="p-6 text-gray-500">{t('issues.issueNotFound')}</div>

  const handleAddLabel = () => {
    const trimmed = labelInput.trim()
    if (trimmed && !labels.includes(trimmed)) {
      const newLabels = [...labels, trimmed]
      setLabels(newLabels)
      updateIssue.mutate({ id: issue.id, labels: newLabels })
      setLabelInput('')
    }
  }

  const handleRemoveLabel = (l: string) => {
    const newLabels = labels.filter((x) => x !== l)
    setLabels(newLabels)
    updateIssue.mutate({ id: issue.id, labels: newLabels })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-2 text-sm">
        <Link to="/projects" className="text-gray-400 hover:text-gray-600">
          {t('nav.projects')}
        </Link>
        <span className="text-gray-300">/</span>
        {issue.projectId && (
          <>
            <Link
              to={`/projects/${issue.projectId}/board`}
              className="text-gray-400 hover:text-gray-600"
            >
              {t('nav.board')}
            </Link>
            <span className="text-gray-300">/</span>
          </>
        )}
        <span className="font-mono text-blue-600 font-medium">{issue.key}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <IssueTypeIcon type={issue.type} />
              <span className="text-xs font-mono text-blue-600 font-medium">{issue.key}</span>
            </div>
            {editingTitle ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="flex-1 text-xl font-bold text-gray-900 border border-blue-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateIssue.mutate({ id: issue.id, title: titleValue })
                      setEditingTitle(false)
                    }
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                />
                <Button
                  size="sm"
                  isLoading={updateIssue.isPending}
                  onClick={() => {
                    updateIssue.mutate({ id: issue.id, title: titleValue })
                    setEditingTitle(false)
                  }}
                >
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingTitle(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <h1
                className="text-xl font-bold text-gray-900 cursor-pointer hover:text-blue-700 transition-colors"
                onClick={() => {
                  setTitleValue(issue.title)
                  setEditingTitle(true)
                }}
              >
                {issue.title}
              </h1>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('common.description')}</h3>
            {editingDesc ? (
              <div className="space-y-2">
                <Textarea
                  autoFocus
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  rows={6}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    isLoading={updateIssue.isPending}
                    onClick={() => {
                      updateIssue.mutate({ id: issue.id, description: descValue })
                      setEditingDesc(false)
                    }}
                  >
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors min-h-[48px]"
                onClick={() => {
                  setDescValue(issue.description || '')
                  setEditingDesc(true)
                }}
              >
                {issue.description ? (
                  <p className="whitespace-pre-wrap">{issue.description}</p>
                ) : (
                  <p className="text-gray-400 italic">{t('issues.clickToAddDescription')}</p>
                )}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t('issues.commentsCount', { count: comments?.length || 0 })}
            </h3>
            <div className="space-y-4 mb-4">
              {comments?.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUser?.id}
                />
              ))}
              {(!comments || comments.length === 0) && (
                <p className="text-sm text-gray-400">{t('issues.noComments')}</p>
              )}
            </div>

            {/* Add Comment */}
            <div className="flex gap-3">
              <Avatar user={currentUser || undefined} size="sm" />
              <div className="flex-1 space-y-2">
                <Textarea
                  placeholder={t('issues.addCommentPlaceholder')}
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!commentText.trim()}
                  isLoading={createComment.isPending}
                  onClick={() => {
                    createComment.mutate(
                      { issueId: issue.id, content: commentText },
                      { onSuccess: () => setCommentText('') },
                    )
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  {t('issues.comment')}
                </Button>
              </div>
            </div>
          </div>

          {/* Work Logs */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {t('issues.timeTracking')}
              </h3>
              <Button size="sm" variant="outline" onClick={() => setShowWorkLogDialog(true)}>
                <Clock className="h-3.5 w-3.5" />
                {t('issues.addWorkLog')}
              </Button>
            </div>
            <div className="space-y-2">
              {workLogs?.map((log) => (
                <div key={log.id} className="flex items-center gap-3 text-sm">
                  <Avatar user={log.user} size="xs" />
                  <span className="font-medium text-gray-900">{formatDuration(log.timeSpent)}</span>
                  {log.description && (
                    <span className="text-gray-500">{log.description}</span>
                  )}
                  <span className="text-gray-400 text-xs ml-auto">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              ))}
              {(!workLogs || workLogs.length === 0) && (
                <p className="text-sm text-gray-400">{t('issues.noTimeLogged')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 border-l border-gray-200 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('common.status')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={issue.statusId || ''}
              onChange={(e) =>
                updateIssue.mutate({ id: issue.id, statusId: e.target.value || undefined })
              }
            >
              <option value="">{t('common.noStatus')}</option>
              {board?.statuses?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('common.priority')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={issue.priority}
              onChange={(e) =>
                updateIssue.mutate({ id: issue.id, priority: e.target.value as IssuePriority })
              }
            >
              {Object.values(IssuePriority).map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('common.type')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={issue.type}
              onChange={(e) =>
                updateIssue.mutate({ id: issue.id, type: e.target.value as IssueType })
              }
            >
              {Object.values(IssueType).map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('common.assignee')}
            </label>
            <UserSelect
              value={issue.assigneeId || null}
              onChange={(id) =>
                updateIssue.mutate({ id: issue.id, assigneeId: id })
              }
            />
          </div>

          {/* Reporter */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('common.reporter')}
            </label>
            <div className="flex items-center gap-2">
              <Avatar user={issue.reporter} size="xs" />
              <span className="text-sm text-gray-700">
                {issue.reporter?.displayName || 'Unknown'}
              </span>
            </div>
          </div>

          {/* Sprint */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('issues.sprint')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={issue.sprintId || ''}
              onChange={(e) =>
                updateIssue.mutate({ id: issue.id, sprintId: e.target.value || null })
              }
            >
              <option value="">{t('common.noSprint')}</option>
              {sprints
                ?.filter((s) => s.status !== 'completed')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('issues.dueDate')}
            </label>
            <Input
              type="date"
              value={issue.dueDate ? issue.dueDate.slice(0, 10) : ''}
              onChange={(e) =>
                updateIssue.mutate({ id: issue.id, dueDate: e.target.value || null })
              }
            />
          </div>

          {/* Story Points */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('issues.storyPoints')}
            </label>
            <Input
              type="number"
              min="0"
              max="100"
              value={issue.storyPoints ?? ''}
              onChange={(e) =>
                updateIssue.mutate({
                  id: issue.id,
                  storyPoints: e.target.value ? parseInt(e.target.value) : null,
                })
              }
            />
          </div>

          {/* Time Estimate */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('issues.timeEstimate')}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                placeholder="minutes"
                value={issue.timeEstimate ?? ''}
                onChange={(e) =>
                  updateIssue.mutate({
                    id: issue.id,
                    timeEstimate: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
            {issue.timeSpent > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {issue.timeEstimate
                  ? t('issues.loggedOf', { logged: formatDuration(issue.timeSpent), estimate: formatDuration(issue.timeEstimate) })
                  : t('issues.logged', { logged: formatDuration(issue.timeSpent) })}
              </p>
            )}
          </div>

          {/* Labels */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('issues.labels')}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(issue.labels || []).map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs"
                >
                  {l}
                  <button
                    type="button"
                    onClick={() => handleRemoveLabel(l)}
                    className="hover:text-blue-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddLabel()
                  }
                }}
                placeholder={t('issues.addLabel')}
                className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddLabel}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Components */}
          {projectComponents && projectComponents.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Components
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(issueComponents || []).map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs"
                  >
                    {c.name}
                    <button
                      type="button"
                      onClick={() =>
                        setIssueComponents.mutate({
                          issueId: issue.id,
                          componentIds: (issueComponents || [])
                            .filter((ic) => ic.id !== c.id)
                            .map((ic) => ic.id),
                        })
                      }
                      className="hover:text-purple-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <select
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    const current = (issueComponents || []).map((c) => c.id)
                    if (!current.includes(e.target.value)) {
                      setIssueComponents.mutate({
                        issueId: issue.id,
                        componentIds: [...current, e.target.value],
                      })
                    }
                  }
                }}
              >
                <option value="">Add component...</option>
                {projectComponents
                  ?.filter(
                    (c) => !(issueComponents || []).find((ic) => ic.id === c.id),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Fix Version */}
          {projectVersions && projectVersions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Fix Version
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(issueVersions || [])
                  .filter((iv) => iv.relationType === 'fix')
                  .map((iv) => (
                    <span
                      key={iv.versionId}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs"
                    >
                      {iv.version?.name || iv.versionId}
                      <button
                        type="button"
                        onClick={() => {
                          const current = (issueVersions || [])
                            .filter((v) => v.relationType === 'fix' && v.versionId !== iv.versionId)
                            .map((v) => v.versionId)
                          setIssueVersions.mutate({
                            issueId: issue.id,
                            versionIds: current,
                            relationType: 'fix',
                          })
                        }}
                        className="hover:text-green-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
              <select
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    const current = (issueVersions || [])
                      .filter((v) => v.relationType === 'fix')
                      .map((v) => v.versionId)
                    if (!current.includes(e.target.value)) {
                      setIssueVersions.mutate({
                        issueId: issue.id,
                        versionIds: [...current, e.target.value],
                        relationType: 'fix',
                      })
                    }
                  }
                }}
              >
                <option value="">Add fix version...</option>
                {projectVersions
                  ?.filter(
                    (v) =>
                      !(issueVersions || []).find(
                        (iv) => iv.versionId === v.id && iv.relationType === 'fix',
                      ),
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Affects Version */}
          {projectVersions && projectVersions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Affects Version
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(issueVersions || [])
                  .filter((iv) => iv.relationType === 'affects')
                  .map((iv) => (
                    <span
                      key={iv.versionId}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs"
                    >
                      {iv.version?.name || iv.versionId}
                      <button
                        type="button"
                        onClick={() => {
                          const current = (issueVersions || [])
                            .filter(
                              (v) => v.relationType === 'affects' && v.versionId !== iv.versionId,
                            )
                            .map((v) => v.versionId)
                          setIssueVersions.mutate({
                            issueId: issue.id,
                            versionIds: current,
                            relationType: 'affects',
                          })
                        }}
                        className="hover:text-orange-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
              <select
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    const current = (issueVersions || [])
                      .filter((v) => v.relationType === 'affects')
                      .map((v) => v.versionId)
                    if (!current.includes(e.target.value)) {
                      setIssueVersions.mutate({
                        issueId: issue.id,
                        versionIds: [...current, e.target.value],
                        relationType: 'affects',
                      })
                    }
                  }
                }}
              >
                <option value="">Add affects version...</option>
                {projectVersions
                  ?.filter(
                    (v) =>
                      !(issueVersions || []).find(
                        (iv) => iv.versionId === v.id && iv.relationType === 'affects',
                      ),
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Custom Fields */}
          {customFieldDefs && customFieldDefs.length > 0 && (
            <div className="pt-2 border-t border-gray-200">
              <CustomFieldsForm
                definitions={customFieldDefs}
                values={customFieldValues || []}
                onChange={(fieldId, value) => {
                  setCustomFields.mutate({
                    issueId: issue.id,
                    values: [{ fieldId, value }],
                  })
                }}
              />
            </div>
          )}

          {/* Dates */}
          <div className="pt-2 border-t border-gray-200 space-y-1">
            <p className="text-xs text-gray-400">
              {t('issues.created', { time: formatRelativeTime(issue.createdAt) })}
            </p>
            <p className="text-xs text-gray-400">
              {t('issues.updated', { time: formatRelativeTime(issue.updatedAt) })}
            </p>
          </div>

          {/* Delete */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => setShowDeleteIssue(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t('issues.deleteIssue')}
          </Button>
        </div>
      </div>

      {/* Work Log Dialog */}
      <Dialog
        open={showWorkLogDialog}
        onClose={() => setShowWorkLogDialog(false)}
        className="max-w-sm"
      >
        <DialogHeader onClose={() => setShowWorkLogDialog(false)}>
          <DialogTitle>{t('issues.addWorkLog')}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <Input
            label={t('issues.timeSpentMinutes')}
            type="number"
            min="1"
            placeholder="e.g. 90"
            value={workLogTime}
            onChange={(e) => setWorkLogTime(e.target.value)}
          />
          <Textarea
            label={t('common.description') + ' (' + t('common.cancel').toLowerCase() + ')'}
            placeholder={t('issues.describeIssue')}
            rows={3}
            value={workLogDesc}
            onChange={(e) => setWorkLogDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowWorkLogDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!workLogTime}
              isLoading={addWorkLog.isPending}
              onClick={() => {
                addWorkLog.mutate(
                  {
                    issueId: issue.id,
                    timeSpent: parseInt(workLogTime),
                    description: workLogDesc || undefined,
                    loggedAt: new Date().toISOString(),
                  },
                  {
                    onSuccess: () => {
                      setShowWorkLogDialog(false)
                      setWorkLogTime('')
                      setWorkLogDesc('')
                    },
                  },
                )
              }}
            >
              {t('issues.addWorkLog')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Issue Confirm */}
      <ConfirmDialog
        open={showDeleteIssue}
        onClose={() => setShowDeleteIssue(false)}
        onConfirm={() =>
          deleteIssue.mutate(
            { id: issue.id, projectId: issue.projectId },
            { onSuccess: () => window.history.back() },
          )
        }
        title={t('issues.deleteIssue')}
        description={t('issues.deleteIssueConfirm', { title: issue.title })}
        confirmLabel={t('issues.deleteIssue')}
        destructive
        isLoading={deleteIssue.isPending}
      />
    </div>
  )
}
