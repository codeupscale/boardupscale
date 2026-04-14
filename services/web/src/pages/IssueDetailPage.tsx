import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { getSocket } from '@/lib/socket'
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
  Users,
  Workflow,
  CalendarDays,
  Tag,
  Package,
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
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
import { cn, formatRelativeTime, formatDuration } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Allowed child types map (must match backend hierarchy)                    */
/* -------------------------------------------------------------------------- */
const CHILD_TYPE_MAP: Record<string, { types: string[]; default: string }> = {
  epic: { types: ['story', 'task', 'bug'], default: 'story' },
  story: { types: ['task', 'bug', 'subtask'], default: 'task' },
  task: { types: ['subtask'], default: 'subtask' },
  bug: { types: ['subtask'], default: 'subtask' },
}

/** Issue types that may serve as a parent, indexed by the child's type. */
const VALID_PARENT_TYPES: Record<string, string[]> = {
  story: ['epic'],
  task: ['epic', 'story'],
  bug: ['epic', 'story'],
  subtask: ['epic', 'story', 'task', 'bug'],
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
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors"
          >
            <IssueTypeIcon type={ancestor.type} className="h-3.5 w-3.5" />
            <span className="font-mono text-xs font-medium">{ancestor.key}</span>
            <span className="truncate max-w-[180px]">{ancestor.title}</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
      <div className="flex-1 min-w-0 rounded-xl bg-card/60 border border-border p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-foreground">
            {comment.author?.displayName || 'Unknown'}
          </span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
          {comment.editedAt && (
            <span className="text-xs text-muted-foreground italic">{t('issues.edited')}</span>
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
          <RichTextDisplay content={comment.content} className="text-sm text-foreground" />
        )}
        {currentUserId === comment.authorId && !editing && (
          <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="text-xs text-muted-foreground hover:text-primary dark:hover:text-primary font-medium transition-colors"
              onClick={() => {
                setEditContent(comment.content)
                setEditing(true)
              }}
            >
              {t('common.edit')}
            </button>
            <button
              className="text-xs text-muted-foreground hover:text-red-500 dark:hover:text-red-400 font-medium transition-colors"
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
      <label className="block text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Issue Panel Section                                                       */
/* -------------------------------------------------------------------------- */
function IssueSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="issue-panel-section">
      <div className="issue-panel-section-header">
        <Icon className="h-3 w-3 opacity-80 flex-shrink-0" />
        {title}
      </div>
      <div className="issue-panel-section-body">
        {children}
      </div>
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
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
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
  const qc = useQueryClient()

  // Re-fetch when the backend pushes an update for this issue (e.g. sprint completion)
  useEffect(() => {
    const socket = getSocket()
    const handler = (updated: { id: string }) => {
      if (updated?.id === issueId) {
        qc.invalidateQueries({ queryKey: ['issue', issueId] })
      }
    }
    socket.on('issue:updated', handler)
    return () => { socket.off('issue:updated', handler) }
  }, [issueId, qc])

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

  const [parentSearch, setParentSearch] = useState('')

  // Candidate parent issues for the current issue's type, filtered by search text.
  // Excludes the issue itself and its own children to prevent circular references.
  const eligibleParents = useMemo(() => {
    if (!issue) return []
    const validTypes = VALID_PARENT_TYPES[issue.type.toLowerCase()] ?? []
    const childIds = new Set(childIssues.map((c) => c.id))
    const needle = parentSearch.toLowerCase()
    return (childIssuesData?.data || []).filter(
      (p) =>
        p.id !== issue.id &&
        !childIds.has(p.id) &&
        validTypes.includes(p.type.toLowerCase()) &&
        (needle === '' || p.title.toLowerCase().includes(needle) || p.key.toLowerCase().includes(needle)),
    )
  }, [childIssuesData, issue, childIssues, parentSearch])

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [commentText, setCommentText] = useState('')
  const [showWorkLogDialog, setShowWorkLogDialog] = useState(false)
  const [workLogTime, setWorkLogTime] = useState('')
  const [workLogDesc, setWorkLogDesc] = useState('')
  const [showDeleteIssue, setShowDeleteIssue] = useState(false)
  const [activityTab, setActivityTab] = useState<'all' | 'comments' | 'history'>('all')
  const [showCreateChild, setShowCreateChild] = useState(false)
  const [childTitle, setChildTitle] = useState('')
  const [childType, setChildType] = useState('')
  const [labelInput, setLabelInput] = useState('')

  // Derive labels directly from issue data (no disconnected local state)
  const issueLabels = issue?.labels || []

  if (isLoading) return <LoadingPage />
  if (!issue) return <div className="p-6 text-muted-foreground">{t('issues.issueNotFound')}</div>

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


  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top Bar — Breadcrumb */}
      <div className="px-6 py-3 border-b border-border bg-card flex items-center gap-2 text-sm flex-wrap">
        <Link to="/projects" className="text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors">
          {t('nav.projects')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        {issue.projectId && (
          <>
            <Link
              to={`/projects/${issue.projectId}/board`}
              className="text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors"
            >
              {t('nav.board')}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          </>
        )}

        {/* Parent breadcrumb chain */}
        <IssueBreadcrumbChain issue={issue} />

        <span className="inline-flex items-center gap-1.5">
          <IssueTypeIcon type={issue.type} className="h-3.5 w-3.5" />
          <span className="font-mono text-primary font-semibold">{issue.key}</span>
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
              <span className="text-sm font-mono text-primary font-semibold">{issue.key}</span>
              {issue.status && <StatusBadge status={issue.status} />}
              <PriorityBadge priority={issue.priority as IssuePriority} />
            </div>
            {editingTitle ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="flex-1 text-2xl font-bold border-primary/50 dark:border-primary rounded-xl px-4 py-2"
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
                className="text-2xl font-bold text-foreground cursor-pointer hover:text-primary dark:hover:text-primary transition-colors leading-tight"
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
          <div className="rounded-2xl bg-card/60 border border-border p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
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
                  issueId={issue.id}
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
                className="cursor-pointer hover:bg-accent/50 rounded-xl p-3 -mx-1 transition-colors min-h-[48px]"
                onClick={() => {
                  setDescValue(issue.description || '')
                  setEditingDesc(true)
                }}
              >
                {issue.description ? (
                  <RichTextDisplay content={issue.description} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">{t('issues.clickToAddDescription')}</p>
                )}
              </div>
            )}
          </div>

          {/* AI Summary */}
          <AiSummaryPanel issueId={issue.id} />

          {/* Linked Issues */}
          <div className="rounded-2xl bg-card/60 border border-border p-5 shadow-sm">
            <IssueLinksList issueId={issue.id} projectId={issue.projectId} />
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
            <div className="rounded-2xl bg-card/60 border border-border p-5 shadow-sm">
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
                <div className="rounded-xl border border-border/60 divide-y divide-border overflow-hidden">
                  {childIssues.map((child) => (
                    <Link
                      key={child.id}
                      to={`/issues/${child.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors"
                    >
                      <IssueTypeIcon type={child.type} />
                      <span className="text-xs font-mono text-primary font-medium">{child.key}</span>
                      <span className="text-sm text-foreground truncate flex-1">{child.title}</span>
                      <StatusBadge status={child.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No child issues yet.</p>
              )}
            </div>
          )}

          {/* Attachments */}
          <div className="rounded-2xl bg-card/60 border border-border p-5 shadow-sm">
            <AttachmentPanel issueId={issue.id} />
          </div>

          {/* Activity Panel — Tabbed: Comments | History | All */}
          <div className="rounded-2xl bg-card/60 border border-border shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-0 border-b border-border">
              {([
                { key: 'comments' as const, label: 'Comments', count: comments?.length },
                { key: 'history' as const, label: 'History' },
                { key: 'all' as const, label: 'All' },
              ]).map(({ key, label, count }) => {
                const isActive = activityTab === key
                return (
                  <button
                    key={key}
                    onClick={() => setActivityTab(key)}
                    className={cn(
                      'relative px-5 py-3.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                    {count != null && count > 0 && (
                      <span className={cn(
                        'ml-1.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {count}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary rounded-t-full" />
                    )}
                  </button>
                )
              })}
              <div className="flex-1" />
              <div className="pr-3">
                <Button size="sm" variant="ghost" onClick={() => setShowWorkLogDialog(true)} className="text-xs text-muted-foreground hover:text-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Log work
                </Button>
              </div>
            </div>

            <div className="p-5">
              {/* Add Comment input — shown on Comments and All tabs */}
              {(activityTab === 'comments' || activityTab === 'all') && (
                <div className="flex gap-3 mb-6 pb-5 border-b border-border">
                  <Avatar user={currentUser || undefined} size="sm" />
                  <div className="flex-1 space-y-2">
                    <RichTextEditor
                      placeholder={t('issues.addCommentPlaceholder')}
                      value={commentText}
                      onChange={setCommentText}
                      users={orgUsers || []}
                      minHeight={80}
                      issueId={issue.id}
                    />
                    <div className="flex justify-end">
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
              )}

              {/* --- Comments tab content --- */}
              {(activityTab === 'comments' || activityTab === 'all') && (
                <div className="space-y-4">
                  {comments?.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      currentUserId={currentUser?.id}
                      users={orgUsers || []}
                    />
                  ))}
                  {activityTab === 'comments' && (!comments || comments.length === 0) && (
                    <div className="text-center py-8">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">{t('issues.noComments')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* --- Work Logs (only in All tab) --- */}
              {activityTab === 'all' && workLogs && workLogs.length > 0 && (
                <div className="mt-6 pt-5 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                      <Clock className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Time Logged
                    </span>
                  </div>
                  <div className="space-y-1.5 ml-8">
                    {workLogs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 text-sm py-1.5 px-3 rounded-lg hover:bg-accent/40 transition-colors">
                        <Avatar user={log.user} size="xs" />
                        <span className="font-semibold text-foreground">{formatDuration(log.timeSpent)}</span>
                        {log.description && (
                          <span className="text-muted-foreground truncate">{log.description}</span>
                        )}
                        <span className="text-muted-foreground text-xs ml-auto flex-shrink-0">
                          {formatRelativeTime(log.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* --- History / Activity changelog --- */}
              {(activityTab === 'history' || activityTab === 'all') && (
                <div className={cn(activityTab === 'all' ? 'mt-6 pt-5 border-t border-border' : '')}>
                  <ActivityList issueId={issue.id} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/*  Sidebar                                                          */}
        {/* ================================================================ */}
        <div className="w-full lg:w-80 xl:w-[340px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border overflow-y-auto">
          <div className="p-4 space-y-3">
            {/* ── Workflow ── */}
            <IssueSection icon={Workflow} title="Workflow">
              <SidebarField label={t('common.status')}>
                <Select value={issue.statusId || '__none__'} onValueChange={(v) => {
                  if (v !== '__none__') updateIssue.mutate({ id: issue.id, statusId: v })
                }}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder={t('common.noStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('common.noStatus')}</SelectItem>
                    {board?.statuses?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SidebarField>

              <SidebarField label={t('common.priority')}>
                <Select value={issue.priority} onValueChange={(v) => updateIssue.mutate({ id: issue.id, priority: v as IssuePriority })}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(IssuePriority).map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SidebarField>

              <SidebarField label={t('common.type')}>
                <IssueTypeSelect
                  value={issue.type}
                  onChange={(val) =>
                    updateIssue.mutate({ id: issue.id, type: val as IssueType })
                  }
                />
              </SidebarField>
            </IssueSection>

            {/* ── People ── */}
            <IssueSection icon={Users} title="People">
              <SidebarField label={t('common.assignee')}>
                <UserSelect
                  value={issue.assigneeId || null}
                  onChange={(id) =>
                    updateIssue.mutate({ id: issue.id, assigneeId: id })
                  }
                />
              </SidebarField>

              <SidebarField label={t('common.reporter')}>
                <div className="flex items-center gap-2.5 py-1">
                  <Avatar user={issue.reporter} size="xs" />
                  <span className="text-sm text-foreground">
                    {issue.reporter?.displayName || 'Unknown'}
                  </span>
                </div>
              </SidebarField>
            </IssueSection>

            {/* ── Planning ── */}
            <IssueSection icon={CalendarDays} title="Planning">
              <SidebarField label={t('issues.sprint')}>
                <Select value={issue.sprintId || '__none__'} onValueChange={(v) => updateIssue.mutate({ id: issue.id, sprintId: v === '__none__' ? null : v })}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder={t('common.noSprint')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('common.noSprint')}</SelectItem>
                    {sprints
                      ?.filter((s) => s.status !== 'completed' || s.id === issue.sprintId)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{s.status === 'completed' ? ' (completed)' : s.status === 'active' ? ' (active)' : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </SidebarField>

              {VALID_PARENT_TYPES[issue.type.toLowerCase()] && (
                <SidebarField label="Parent Issue">
                  <Input
                    type="text"
                    value={parentSearch}
                    onChange={(e) => setParentSearch(e.target.value)}
                    placeholder="Search by key or title…"
                    className="text-xs mb-1"
                  />
                  <Select value={issue.parentId || '__none__'} onValueChange={(v) => updateIssue.mutate({ id: issue.id, parentId: v === '__none__' ? null : v })}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="— No parent —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No parent —</SelectItem>
                      {eligibleParents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          [{p.key}] {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SidebarField>
              )}

              <SidebarField label={t('issues.dueDate')}>
                <Input
                  type="date"
                  value={issue.dueDate ? issue.dueDate.slice(0, 10) : ''}
                  onChange={(e) =>
                    updateIssue.mutate({ id: issue.id, dueDate: e.target.value || null })
                  }
                  className=""
                />
              </SidebarField>

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
                  className=""
                />
              </SidebarField>

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
                  className=""
                />
                {issue.timeSpent > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {issue.timeEstimate
                      ? t('issues.loggedOf', { logged: formatDuration(issue.timeSpent), estimate: formatDuration(issue.timeEstimate) })
                      : t('issues.logged', { logged: formatDuration(issue.timeSpent) })}
                  </p>
                )}
              </SidebarField>
            </IssueSection>

            {/* ── Labels & Components ── */}
            <IssueSection icon={Tag} title="Labels & Tags">
              <SidebarField label={t('issues.labels')}>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {issueLabels.map((l) => (
                    <span
                      key={l}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium"
                    >
                      {l}
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(l)}
                        className="hover:text-primary/80 dark:hover:text-primary transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input
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
                    className="flex-1 text-xs"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddLabel} className="rounded-lg">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </SidebarField>

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
                  <Select key={`comp-${(issueComponents || []).length}`} onValueChange={(v) => {
                    const current = (issueComponents || []).map((c) => c.id)
                    if (!current.includes(v)) {
                      setIssueComponents.mutate({
                        issueId: issue.id,
                        componentIds: [...current, v],
                      })
                    }
                  }}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Add component..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projectComponents
                        ?.filter((c) => !(issueComponents || []).find((ic) => ic.id === c.id))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </SidebarField>
              )}
            </IssueSection>

            {/* ── Releases ── (only shown when project has versions) */}
            {projectVersions && projectVersions.length > 0 && (
              <IssueSection icon={Package} title="Releases">
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
                  <Select key={`fix-${(issueVersions || []).filter((v) => v.relationType === 'fix').length}`} onValueChange={(v) => {
                    const current = (issueVersions || [])
                      .filter((iv) => iv.relationType === 'fix')
                      .map((iv) => iv.versionId)
                    if (!current.includes(v)) {
                      setIssueVersions.mutate({
                        issueId: issue.id,
                        versionIds: [...current, v],
                        relationType: 'fix',
                      })
                    }
                  }}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Add fix version..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projectVersions
                        ?.filter(
                          (v) =>
                            !(issueVersions || []).find(
                              (iv) => iv.versionId === v.id && iv.relationType === 'fix',
                            ),
                        )
                        .map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </SidebarField>

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
                  <Select key={`affects-${(issueVersions || []).filter((v) => v.relationType === 'affects').length}`} onValueChange={(v) => {
                    const current = (issueVersions || [])
                      .filter((iv) => iv.relationType === 'affects')
                      .map((iv) => iv.versionId)
                    if (!current.includes(v)) {
                      setIssueVersions.mutate({
                        issueId: issue.id,
                        versionIds: [...current, v],
                        relationType: 'affects',
                      })
                    }
                  }}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Add affects version..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projectVersions
                        ?.filter(
                          (v) =>
                            !(issueVersions || []).find(
                              (iv) => iv.versionId === v.id && iv.relationType === 'affects',
                            ),
                        )
                        .map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </SidebarField>
              </IssueSection>
            )}

            {/* ── Custom Fields ── */}
            {customFieldDefs && customFieldDefs.length > 0 && (
              <div className="issue-panel-section">
                <div className="issue-panel-section-header">
                  <svg className="h-3 w-3 opacity-80" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="14" rx="2"/><path d="M5 8h6M8 5v6"/></svg>
                  Custom Fields
                </div>
                <div className="issue-panel-section-body">
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
              </div>
            )}

            {/* ── Watchers ── */}
            <WatchButton issueId={issue.id} />

            {/* ── Metadata ── */}
            <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 space-y-1">
              <p className="text-[11px] text-muted-foreground">
                {t('issues.created', { time: formatRelativeTime(issue.createdAt) })}
              </p>
              <p className="text-[11px] text-muted-foreground">
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
        onOpenChange={(o) => !o && setShowWorkLogDialog(false)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('issues.addWorkLog')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Child Issue Dialog */}
      <Dialog
        open={showCreateChild}
        onOpenChange={(o) => !o && setShowCreateChild(false)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Child Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const config = CHILD_TYPE_MAP[issue.type]
              if (!config) return <p className="text-sm text-muted-foreground">This issue type cannot have children.</p>

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
