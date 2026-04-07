import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Send,
  Trash2,
  Clock,
  Plus,
  X,
  ChevronRight,
  MessageSquare,
  History,
  ListTree,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useIssue,
  useIssues,
  useCreateIssue,
  useUpdateIssue,
  useDeleteIssue,
  useWorkLogs,
  useAddWorkLog,
} from '@/hooks/useIssues'
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from '@/hooks/useComments'
import { useUsers } from '@/hooks/useUsers'
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
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { RichTextDisplay } from '@/components/ui/rich-text-display'
import {
  IssueType,
  IssuePriority,
  Comment,
  Issue,
} from '@/types'
import { LoadingPage } from '@/components/ui/spinner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { IssueTypeSelect } from '@/components/issues/issue-type-select'
import { PriorityBadge } from '@/components/issues/priority-badge'
import { StatusBadge } from '@/components/issues/status-badge'
import { AttachmentPanel } from '@/components/issues/attachment-panel'
import { UserSelect } from '@/components/common/user-select'
import { IssueLinksList } from '@/components/issues/issue-links-list'
import { GitHubEventsList } from '@/components/issues/github-events-list'
import { SimilarIssuesPanel } from '@/components/issues/similar-issues-panel'
import { AiSummaryPanel } from '@/components/issues/ai-summary-panel'
import { WatchButton } from '@/components/issues/watch-button'
import { ActivityList } from '@/components/issues/activity-list'
import { formatRelativeTime, formatDuration } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Allowed child types map (must match backend hierarchy)                    */
/* -------------------------------------------------------------------------- */
const CHILD_TYPE_MAP: Record<string, { types: string[]; default: string }> = {
  epic: { types: ['story', 'task', 'bug'], default: 'story' },
  story: { types: ['task', 'bug', 'subtask'], default: 'task' },
  task: { types: ['subtask'], default: 'subtask' },
  bug: { types: ['subtask'], default: 'subtask' },
}

/* -------------------------------------------------------------------------- */
/*  Breadcrumb helpers                                                        */
/* -------------------------------------------------------------------------- */
function IssueBreadcrumbChain({ issue }: { issue: Issue }) {
  // Walk up the parent chain to build full hierarchy: Epic > Story > Task > current
  const chain: Array<{ id: string; key: string; title: string; type: IssueType }> = []

  let cursor: any = issue.parent
  while (cursor) {
    chain.unshift({
      id: cursor.id,
      key: cursor.key,
      title: cursor.title,
      type: cursor.type,
    })
    cursor = cursor.parent
  }

  if (chain.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chain.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1.5">
          <Link
            to={`/issues/${ancestor.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <IssueTypeIcon type={ancestor.type} className="h-3.5 w-3.5" />
            <span className="font-mono text-xs font-medium">{ancestor.key}</span>
            <span className="truncate max-w-[180px]">{ancestor.title}</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-600 flex-shrink-0" />
        </span>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Comment Item                                                              */
/* -------------------------------------------------------------------------- */
function CommentItem({
  comment,
  currentUserId,
  users,
}: {
  comment: Comment
  currentUserId?: string
  users?: import('@/types').User[]
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [showDelete, setShowDelete] = useState(false)
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()

  return (
    <div className="flex gap-3 group">
      <Avatar user={comment.author} size="sm" />
      <div className="flex-1 min-w-0 rounded-xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {comment.author?.displayName || 'Unknown'}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(comment.createdAt)}</span>
          {comment.editedAt && (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">{t('issues.edited')}</span>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <RichTextEditor
              value={editContent}
              onChange={setEditContent}
              users={users || []}
              minHeight={80}
              autoFocus
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
          <RichTextDisplay content={comment.content} className="text-sm text-gray-700 dark:text-gray-300" />
        )}
        {currentUserId === comment.authorId && !editing && (
          <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
              onClick={() => {
                setEditContent(comment.content)
                setEditing(true)
              }}
            >
              {t('common.edit')}
            </button>
            <button
              className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-medium transition-colors"
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

/* -------------------------------------------------------------------------- */
/*  Sidebar Field Wrapper                                                     */
/* -------------------------------------------------------------------------- */
function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section Header                                                            */
/* -------------------------------------------------------------------------- */
function SectionHeader({
  icon: Icon,
  title,
  count,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  count?: number
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
              ({count})
            </span>
          )}
        </h3>
      </div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main Page Component                                                       */
/* -------------------------------------------------------------------------- */
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

  const { data: usersResult } = useUsers()
  const orgUsers = usersResult?.data
  const updateIssue = useUpdateIssue()
  const deleteIssue = useDeleteIssue()
  const createIssue = useCreateIssue()
  const createComment = useCreateComment()
  const addWorkLog = useAddWorkLog()

  // Child issues — use the dedicated children endpoint via filter
  const { data: childIssuesData } = useIssues(
    issue ? { projectId: issue.projectId } : undefined,
  )
  const childIssues = useMemo(
    () => (childIssuesData?.data || []).filter((i) => i.parentId === issueId),
    [childIssuesData, issueId],
  )

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [commentText, setCommentText] = useState('')
  const [showWorkLogDialog, setShowWorkLogDialog] = useState(false)
  const [workLogTime, setWorkLogTime] = useState('')
  const [workLogDesc, setWorkLogDesc] = useState('')
  const [showDeleteIssue, setShowDeleteIssue] = useState(false)
  const [showCreateChild, setShowCreateChild] = useState(false)
  const [childTitle, setChildTitle] = useState('')
  const [childType, setChildType] = useState('')
  const [labelInput, setLabelInput] = useState('')

  // Derive labels directly from issue data (no disconnected local state)
  const issueLabels = issue?.labels || []

  if (isLoading) return <LoadingPage />
  if (!issue) return <div className="p-6 text-gray-500">{t('issues.issueNotFound')}</div>

  const handleAddLabel = () => {
    const trimmed = labelInput.trim()
    if (trimmed && !issueLabels.includes(trimmed)) {
      updateIssue.mutate({ id: issue.id, labels: [...issueLabels, trimmed] })
      setLabelInput('')
    }
  }

  const handleRemoveLabel = (l: string) => {
    updateIssue.mutate({ id: issue.id, labels: issueLabels.filter((x) => x !== l) })
  }

  // Can this issue have children?
  const childConfig = CHILD_TYPE_MAP[issue.type]

  // Select style shared across sidebar
  const selectClasses =
    'w-full rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors'

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* Top Bar — Breadcrumb */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-2 text-sm flex-wrap">
        <Link to="/projects" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          {t('nav.projects')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
        {issue.projectId && (
          <>
            <Link
              to={`/projects/${issue.projectId}/board`}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {t('nav.board')}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
          </>
        )}

        {/* Parent breadcrumb chain */}
        <IssueBreadcrumbChain issue={issue} />

        <span className="inline-flex items-center gap-1.5">
          <IssueTypeIcon type={issue.type} className="h-3.5 w-3.5" />
          <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{issue.key}</span>
        </span>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* ================================================================ */}
        {/*  Main Content Area                                               */}
        {/* ================================================================ */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
          {/* Title Section */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <IssueTypeIcon type={issue.type} className="h-5 w-5" />
              <span className="text-sm font-mono text-blue-600 dark:text-blue-400 font-semibold">{issue.key}</span>
              {issue.status && <StatusBadge status={issue.status} />}
              <PriorityBadge priority={issue.priority as IssuePriority} />
            </div>
            {editingTitle ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="flex-1 text-2xl font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-shadow"
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
                className="text-2xl font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-700 dark:hover:text-blue-400 transition-colors leading-tight"
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
          <div className="rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              {t('common.description')}
            </h3>
            {editingDesc ? (
              <div className="space-y-3">
                <RichTextEditor
                  value={descValue}
                  onChange={setDescValue}
                  users={orgUsers || []}
                  minHeight={150}
                  autoFocus
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
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl p-3 -mx-1 transition-colors min-h-[48px]"
                onClick={() => {
                  setDescValue(issue.description || '')
                  setEditingDesc(true)
                }}
              >
                {issue.description ? (
                  <RichTextDisplay content={issue.description} />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t('issues.clickToAddDescription')}</p>
                )}
              </div>
            )}
          </div>

          {/* AI Summary */}
          <AiSummaryPanel issueId={issue.id} />

          {/* Linked Issues */}
          <div className="rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm">
            <IssueLinksList issueId={issue.id} />
          </div>

          {/* GitHub Activity */}
          <GitHubEventsList issueId={issue.id} projectId={issue.projectId} />

          {/* Similar Issues */}
          <SimilarIssuesPanel
            title={issue.title}
            projectId={issue.projectId}
            excludeIssueId={issue.id}
          />

          {/* Child Issues */}
          {childConfig && (
            <div className="rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm">
              <SectionHeader
                icon={ListTree}
                title="Child Issues"
                count={childIssues.length}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCreateChild(true)}
                    className="rounded-lg"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                }
              />
              {childIssues.length > 0 ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                  {childIssues.map((child) => (
                    <Link
                      key={child.id}
                      to={`/issues/${child.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <IssueTypeIcon type={child.type} />
                      <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-medium">{child.key}</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">{child.title}</span>
                      <StatusBadge status={child.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No child issues yet.</p>
              )}
            </div>
          )}

          {/* Attachments */}
          <div className="rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm">
            <AttachmentPanel issueId={issue.id} />
          </div>

          {/* Comments */}
          <div className="rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm">
            <SectionHeader
              icon={MessageSquare}
              title={t('issues.commentsCount', { count: comments?.length || 0 })}
            />
            <div className="space-y-4 mb-5">
              {comments?.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUser?.id}
                  users={orgUsers || []}
                />
              ))}
              {(!comments || comments.length === 0) && (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('issues.noComments')}</p>
              )}
            </div>

            {/* Add Comment */}
            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <Avatar user={currentUser || undefined} size="sm" />
              <div className="flex-1 space-y-2">
                <RichTextEditor
                  placeholder={t('issues.addCommentPlaceholder')}
                  value={commentText}
                  onChange={setCommentText}
                  users={orgUsers || []}
                  minHeight={80}
                />
                <Button
                  size="sm"
                  disabled={!commentText || commentText === '<p></p>'}
                  isLoading={createComment.isPending}
                  onClick={() => {
                    createComment.mutate(
                      { issueId: issue.id, content: commentText },
                      { onSuccess: () => setCommentText('') },
                    )
                  }}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {t('issues.comment')}
                </Button>
              </div>
            </div>
          </div>

          {/* Work Logs */}
          <div className="rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm">
            <SectionHeader
              icon={Clock}
              title={t('issues.timeTracking')}
              action={
                <Button size="sm" variant="outline" onClick={() => setShowWorkLogDialog(true)} className="rounded-lg">
                  <Clock className="h-3.5 w-3.5 mr-1" />
                  {t('issues.addWorkLog')}
                </Button>
              }
            />
            <div className="space-y-2">
              {workLogs?.map((log) => (
                <div key={log.id} className="flex items-center gap-3 text-sm py-1.5">
                  <Avatar user={log.user} size="xs" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatDuration(log.timeSpent)}</span>
                  {log.description && (
                    <span className="text-gray-500 dark:text-gray-400 truncate">{log.description}</span>
                  )}
                  <span className="text-gray-400 dark:text-gray-500 text-xs ml-auto flex-shrink-0">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              ))}
              {(!workLogs || workLogs.length === 0) && (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('issues.noTimeLogged')}</p>
              )}
            </div>
          </div>

          {/* Activity / Changelog */}
          <div className="rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 p-5 shadow-sm">
            <SectionHeader icon={History} title={t('activity.title')} />
            <ActivityList issueId={issue.id} />
          </div>
        </div>

        {/* ================================================================ */}
        {/*  Sidebar                                                          */}
        {/* ================================================================ */}
        <div className="w-full lg:w-80 xl:w-[340px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-800 overflow-y-auto bg-white dark:bg-gray-900/50">
          <div className="p-5 space-y-5">
            {/* Status */}
            <SidebarField label={t('common.status')}>
              <select
                className={selectClasses}
                value={issue.statusId || ''}
                onChange={(e) => {
                  const val = e.target.value
                  if (val) {
                    updateIssue.mutate({ id: issue.id, statusId: val })
                  }
                }}
              >
                <option value="">{t('common.noStatus')}</option>
                {board?.statuses?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </SidebarField>

            {/* Priority */}
            <SidebarField label={t('common.priority')}>
              <select
                className={selectClasses}
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
            </SidebarField>

            {/* Type */}
            <SidebarField label={t('common.type')}>
              <IssueTypeSelect
                value={issue.type}
                onChange={(val) =>
                  updateIssue.mutate({ id: issue.id, type: val as IssueType })
                }
              />
            </SidebarField>

            {/* Assignee */}
            <SidebarField label={t('common.assignee')}>
              <UserSelect
                value={issue.assigneeId || null}
                onChange={(id) =>
                  updateIssue.mutate({ id: issue.id, assigneeId: id })
                }
              />
            </SidebarField>

            {/* Reporter */}
            <SidebarField label={t('common.reporter')}>
              <div className="flex items-center gap-2.5 py-1">
                <Avatar user={issue.reporter} size="xs" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {issue.reporter?.displayName || 'Unknown'}
                </span>
              </div>
            </SidebarField>

            {/* Sprint */}
            <SidebarField label={t('issues.sprint')}>
              <select
                className={selectClasses}
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
            </SidebarField>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Due Date */}
            <SidebarField label={t('issues.dueDate')}>
              <Input
                type="date"
                value={issue.dueDate ? issue.dueDate.slice(0, 10) : ''}
                onChange={(e) =>
                  updateIssue.mutate({ id: issue.id, dueDate: e.target.value || null })
                }
                className="dark:bg-gray-800 dark:border-gray-700/60"
              />
            </SidebarField>

            {/* Story Points */}
            <SidebarField label={t('issues.storyPoints')}>
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
                className="dark:bg-gray-800 dark:border-gray-700/60"
              />
            </SidebarField>

            {/* Time Estimate */}
            <SidebarField label={t('issues.timeEstimate')}>
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
                className="dark:bg-gray-800 dark:border-gray-700/60"
              />
              {issue.timeSpent > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  {issue.timeEstimate
                    ? t('issues.loggedOf', { logged: formatDuration(issue.timeSpent), estimate: formatDuration(issue.timeEstimate) })
                    : t('issues.logged', { logged: formatDuration(issue.timeSpent) })}
                </p>
              )}
            </SidebarField>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Labels */}
            <SidebarField label={t('issues.labels')}>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {issueLabels.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium"
                  >
                    {l}
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(l)}
                      className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
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
                  className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                />
                <Button type="button" variant="secondary" size="sm" onClick={handleAddLabel} className="rounded-lg">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </SidebarField>

            {/* Components */}
            {projectComponents && projectComponents.length > 0 && (
              <SidebarField label="Components">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(issueComponents || []).map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium"
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
                        className="hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  className={selectClasses}
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
                    ?.filter((c) => !(issueComponents || []).find((ic) => ic.id === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </SidebarField>
            )}

            {/* Fix Version */}
            {projectVersions && projectVersions.length > 0 && (
              <SidebarField label="Fix Version">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(issueVersions || [])
                    .filter((iv) => iv.relationType === 'fix')
                    .map((iv) => (
                      <span
                        key={iv.versionId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium"
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
                          className="hover:text-green-900 dark:hover:text-green-100 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
                <select
                  className={selectClasses}
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
              </SidebarField>
            )}

            {/* Affects Version */}
            {projectVersions && projectVersions.length > 0 && (
              <SidebarField label="Affects Version">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(issueVersions || [])
                    .filter((iv) => iv.relationType === 'affects')
                    .map((iv) => (
                      <span
                        key={iv.versionId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-medium"
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
                          className="hover:text-orange-900 dark:hover:text-orange-100 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
                <select
                  className={selectClasses}
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
              </SidebarField>
            )}

            {/* Custom Fields */}
            {customFieldDefs && customFieldDefs.length > 0 && (
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
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

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Watchers */}
            <WatchButton issueId={issue.id} />

            {/* Metadata */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('issues.created', { time: formatRelativeTime(issue.createdAt) })}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('issues.updated', { time: formatRelativeTime(issue.updatedAt) })}
              </p>
            </div>

            {/* Delete */}
            <Button
              variant="destructive"
              size="sm"
              className="w-full rounded-lg"
              onClick={() => setShowDeleteIssue(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {t('issues.deleteIssue')}
            </Button>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/*  Dialogs                                                          */}
      {/* ================================================================ */}

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
            label={`${t('common.description')} (${t('common.optional', 'optional')})`}
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
                    timeSpent: parseInt(workLogTime) * 60,
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

      {/* Create Child Issue Dialog */}
      <Dialog
        open={showCreateChild}
        onClose={() => setShowCreateChild(false)}
        className="max-w-sm"
      >
        <DialogHeader onClose={() => setShowCreateChild(false)}>
          <DialogTitle>Create Child Issue</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          {(() => {
            const config = CHILD_TYPE_MAP[issue.type]
            if (!config) return <p className="text-sm text-gray-500 dark:text-gray-400">This issue type cannot have children.</p>

            const selectedChildType = childType || config.default

            return (
              <>
                <Input
                  label="Title"
                  placeholder="Child issue title"
                  value={childTitle}
                  onChange={(e) => setChildTitle(e.target.value)}
                  autoFocus
                />
                <IssueTypeSelect
                  label="Type"
                  value={selectedChildType}
                  onChange={(val) => setChildType(val)}
                  options={config.types}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowCreateChild(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    disabled={!childTitle.trim()}
                    isLoading={createIssue.isPending}
                    onClick={() => {
                      createIssue.mutate(
                        {
                          projectId: issue.projectId,
                          title: childTitle.trim(),
                          type: selectedChildType,
                          priority: 'medium',
                          parentId: issue.id,
                        },
                        {
                          onSuccess: () => {
                            setShowCreateChild(false)
                            setChildTitle('')
                            setChildType('')
                          },
                        },
                      )
                    }}
                  >
                    Create
                  </Button>
                </div>
              </>
            )
          })()}
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
