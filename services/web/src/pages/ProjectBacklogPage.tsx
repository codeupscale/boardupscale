import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Play,
  CheckCircle,
  Trash2,
  GripVertical,
  Target,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProject, useProjects } from '@/hooks/useProjects'
import {
  useSprints,
  useCreateSprint,
  useStartSprint,
  useCompleteSprint,
  useDeleteSprint,
  useUpdateSprint,
} from '@/hooks/useSprints'
import { useIssues, useCreateIssue, useUpdateIssue, useMoveIssueSprint } from '@/hooks/useIssues'
import { useBoard } from '@/hooks/useBoard'
import { useUsers } from '@/hooks/useUsers'
import { useSelectionStore } from '@/store/selection.store'
import { SprintStatus, Issue } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogBody,
} from '@/components/ui/dialog'
import { IssueForm, IssueFormHandle } from '@/components/issues/issue-form'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { BulkActionsBar } from '@/components/issues/bulk-actions-bar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from '@/components/ui/avatar'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { PriorityBadge } from '@/components/issues/priority-badge'
import { StatusBadge } from '@/components/issues/status-badge'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Draggable Issue Row                                                */
/* ------------------------------------------------------------------ */

function DraggableIssueRow({
  issue,
  index,
  selectable,
  statuses,
  onUpdateIssue,
}: {
  issue: Issue
  index: number
  selectable?: boolean
  statuses?: Array<{ id: string; name: string }>
  onUpdateIssue?: (id: string, updates: Record<string, unknown>) => void
}) {
  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const toggleIssue = useSelectionStore((s) => s.toggleIssue)
  const isSelected = selectedIssueIds.has(issue.id)

  return (
    <Draggable draggableId={issue.id} index={index}>
      {(provided, snapshot) => (
        <tr
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'group hover:bg-accent/50 transition-colors border-b border-border last:border-0',
            selectable && isSelected && 'bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/10',
            snapshot.isDragging && 'bg-primary/10 shadow-lg rounded-lg border border-primary/30 dark:border-primary/40',
          )}
          style={{
            ...provided.draggableProps.style,
            // Remove table layout issues when dragging
            ...(snapshot.isDragging ? { display: 'flex', alignItems: 'center' } : {}),
          }}
        >
          {/* Drag Handle */}
          <td
            className="px-1 py-3 w-8"
            {...provided.dragHandleProps}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
          </td>

          {/* Checkbox */}
          {selectable && (
            <td className="px-2 py-3 w-8">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation()
                  toggleIssue(issue.id)
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
              />
            </td>
          )}

          {/* Type + Key */}
          <td className="px-3 py-3 w-28">
            <Link
              to={`/issues/${issue.id}`}
              className="flex items-center gap-1.5 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <IssueTypeIcon type={issue.type} />
              <span className="text-xs font-mono text-primary font-medium">{issue.key}</span>
            </Link>
          </td>

          {/* Title */}
          <td className="px-3 py-3">
            <Link
              to={`/issues/${issue.id}`}
              className="text-sm text-foreground font-medium line-clamp-1 hover:text-primary dark:hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {issue.title}
            </Link>
          </td>

          {/* Priority */}
          <td className="px-3 py-3 w-24">
            <PriorityBadge priority={issue.priority} />
          </td>

          {/* Status — inline editable */}
          <td className="px-3 py-3 w-32" onClick={(e) => e.stopPropagation()}>
            {statuses && onUpdateIssue ? (
              <Select
                value={issue.statusId || ''}
                onValueChange={(v) => onUpdateIssue(issue.id, { statusId: v })}
              >
                <SelectTrigger className="text-xs py-1 h-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge status={issue.status} />
            )}
          </td>

          {/* Due Date — inline editable */}
          <td className="px-3 py-3 w-32" onClick={(e) => e.stopPropagation()}>
            {onUpdateIssue ? (
              <DatePicker
                value={issue.dueDate ? String(issue.dueDate).slice(0, 10) : undefined}
                onChange={(date) => onUpdateIssue(issue.id, { dueDate: date ?? null })}
                placeholder="No date"
                className="text-xs"
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {issue.dueDate ? formatDate(issue.dueDate) : '--'}
              </span>
            )}
          </td>

          {/* Assignee */}
          <td className="px-3 py-3 w-12">
            {issue.assignee ? (
              <Avatar user={issue.assignee} size="xs" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted border border-dashed border-border" />
            )}
          </td>

          {/* Story Points */}
          <td className="px-3 py-3 w-14 text-center">
            {issue.storyPoints != null ? (
              <span className="text-xs font-medium text-foreground bg-muted rounded-full px-2 py-0.5">
                {issue.storyPoints}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/60">--</span>
            )}
          </td>
        </tr>
      )}
    </Draggable>
  )
}

/* ------------------------------------------------------------------ */
/*  Sprint Section                                                     */
/* ------------------------------------------------------------------ */

function SprintSection({
  sprint,
  issues,
  projectId,
  statuses,
  onUpdateIssue,
}: {
  sprint: any
  issues: Issue[]
  projectId: string
  statuses?: Array<{ id: string; name: string }>
  onUpdateIssue?: (id: string, updates: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [showConfirm, setShowConfirm] = useState<'start' | 'complete' | 'delete' | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalText, setGoalText] = useState(sprint.goal || '')
  const [moveToSprintId, setMoveToSprintId] = useState<string>('')
  const [newSprintName, setNewSprintName] = useState('')

  const startSprint = useStartSprint()
  const completeSprint = useCompleteSprint()
  const createSprint = useCreateSprint()
  const deleteSprint = useDeleteSprint()
  const updateSprint = useUpdateSprint()
  const { data: allSprints = [] } = useSprints(projectId)

  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const selectAll = useSelectionStore((s) => s.selectAll)

  const isActive = sprint.status === SprintStatus.ACTIVE
  const isPlanned = sprint.status === SprintStatus.PLANNED

  const issueIds = issues.map((i) => i.id)
  const allSelected = issueIds.length > 0 && issueIds.every((id) => selectedIssueIds.has(id))
  const someSelected = issueIds.some((id) => selectedIssueIds.has(id))

  // Story points calculation
  const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)
  const completedPoints = issues
    .filter((i) => i.status?.category === 'done')
    .reduce((sum, i) => sum + (i.storyPoints || 0), 0)

  const handleSaveGoal = () => {
    updateSprint.mutate(
      { projectId, sprintId: sprint.id, goal: goalText },
      { onSuccess: () => setEditingGoal(false) },
    )
  }

  return (
    <Droppable droppableId={sprint.id} type="ISSUE">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            'border rounded-xl overflow-hidden transition-colors',
            snapshot.isDraggingOver
              ? 'border-primary/50 dark:border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-border',
          )}
        >
          {/* Sprint Header */}
          <div
            className={cn(
              'flex items-center justify-between px-4 py-3 cursor-pointer transition-colors',
              isActive
                ? 'bg-primary/10 border-b border-primary/20 dark:border-primary/30'
                : 'bg-muted/50 border-b border-border',
            )}
            onClick={() => setCollapsed((c) => !c)}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {collapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <h3 className="font-semibold text-sm text-foreground truncate">{sprint.name}</h3>
              {isActive && (
                <span className="px-2 py-0.5 bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium rounded-full flex-shrink-0">
                  {t('sprints.active')}
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                {issues.length} {issues.length !== 1 ? 'issues' : 'issue'}
              </span>

              {/* Story Points Summary */}
              {totalPoints > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-xs font-medium text-foreground flex-shrink-0">
                  <Target className="h-3 w-3" />
                  {completedPoints}/{totalPoints} SP
                </span>
              )}

              {sprint.startDate && sprint.endDate && (
                <span className="text-xs text-muted-foreground ml-2 flex-shrink-0 hidden sm:inline">
                  {formatDate(sprint.startDate)} — {formatDate(sprint.endDate)}
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-2 flex-shrink-0 ml-2"
              onClick={(e) => e.stopPropagation()}
            >
              {isPlanned && (
                <Button size="sm" variant="outline" onClick={() => setShowConfirm('start')}>
                  <Play className="h-3.5 w-3.5" />
                  {t('sprints.startSprint')}
                </Button>
              )}
              {isActive && (
                <Button size="sm" variant="secondary" onClick={() => setShowConfirm('complete')}>
                  <CheckCircle className="h-3.5 w-3.5" />
                  {t('sprints.complete')}
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setShowConfirm('delete')}
                className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Sprint Goal */}
          {!collapsed && (sprint.goal || editingGoal) && (
            <div className="px-4 py-2 bg-muted/50 border-b border-border">
              {editingGoal ? (
                <div className="flex items-start gap-2">
                  <Textarea
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                    placeholder="Sprint goal..."
                    rows={2}
                    className="text-sm flex-1"
                    autoFocus
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={handleSaveGoal}
                      className="text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingGoal(false)
                        setGoalText(sprint.goal || '')
                      }}
                      className="text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="group flex items-start gap-2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingGoal(true)
                  }}
                >
                  <Target className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground flex-1">
                    <span className="font-medium text-muted-foreground">Goal:</span>{' '}
                    {sprint.goal}
                  </p>
                  <Pencil className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                </div>
              )}
            </div>
          )}

          {/* Add goal button when no goal exists */}
          {!collapsed && !sprint.goal && !editingGoal && (
            <div className="px-4 py-1.5 border-b border-border">
              <button
                onClick={() => setEditingGoal(true)}
                className="text-xs text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add sprint goal
              </button>
            </div>
          )}

          {/* Issues */}
          {!collapsed && (
            <div
              className={cn(
                'min-h-[48px] transition-colors',
                snapshot.isDraggingOver && 'bg-primary/5 dark:bg-primary/10',
              )}
            >
              {issues.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="w-8" />
                      <th className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected && !allSelected
                          }}
                          onChange={() => selectAll(issueIds)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                        />
                      </th>
                      <th colSpan={6} />
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((issue, index) => (
                      <DraggableIssueRow key={issue.id} issue={issue} index={index} selectable statuses={statuses} onUpdateIssue={onUpdateIssue} />
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Drag issues here or create new ones
                </div>
              )}
            </div>
          )}
          {provided.placeholder}

          {/* Start Sprint Confirm */}
          <Dialog
            open={showConfirm === 'start'}
            onOpenChange={(o) => !o && setShowConfirm(null)}
          >
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{t('sprints.startSprint')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Starting <strong>{sprint.name}</strong> with {issues.length} issues ({totalPoints} story points).
                </div>
                <DatePicker
                  label={t('sprints.startDate')}
                  value={startDate || undefined}
                  onChange={(date) => setStartDate(date ?? '')}
                />
                <DatePicker
                  label={t('sprints.endDate')}
                  value={endDate || undefined}
                  onChange={(date) => setEndDate(date ?? '')}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowConfirm(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    isLoading={startSprint.isPending}
                    onClick={() =>
                      startSprint.mutate(
                        { projectId, sprintId: sprint.id, startDate, endDate },
                        { onSuccess: () => setShowConfirm(null) },
                      )
                    }
                  >
                    {t('sprints.start')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Complete Sprint Dialog */}
          <Dialog
            open={showConfirm === 'complete'}
            onOpenChange={(o) => !o && setShowConfirm(null)}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('sprints.completeSprint')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {(() => {
                  const doneCount = issues.filter((i) => i.status?.category === 'done').length
                  const incompleteCount = issues.length - doneCount
                  const otherSprints = allSprints.filter(
                    (s) => s.id !== sprint.id && s.status !== 'completed',
                  )
                  return (
                    <>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <CheckCircle className="h-4 w-4" /> {doneCount} done
                          </span>
                          {incompleteCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                              · {incompleteCount} incomplete
                            </span>
                          )}
                        </div>
                      </div>

                      {incompleteCount > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">
                            Move {incompleteCount} incomplete issue{incompleteCount > 1 ? 's' : ''} to
                          </label>
                          <Select
                            value={moveToSprintId || '__backlog__'}
                            onValueChange={(v) => { setMoveToSprintId(v === '__backlog__' ? '' : v); if (v !== '__new__') setNewSprintName('') }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__backlog__">Backlog</SelectItem>
                              <SelectItem value="__new__">+ Create new sprint</SelectItem>
                              {otherSprints.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}{s.status === 'active' ? ' (active)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {moveToSprintId === '__new__' && (
                            <Input
                              placeholder="New sprint name"
                              value={newSprintName}
                              onChange={(e) => setNewSprintName(e.target.value)}
                              autoFocus
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {moveToSprintId === '__new__'
                              ? 'A new sprint will be created and incomplete issues moved to it.'
                              : moveToSprintId
                                ? 'Incomplete issues will be moved to the selected sprint.'
                                : 'Incomplete issues will be moved to the backlog.'}
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => { setShowConfirm(null); setNewSprintName('') }}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          isLoading={completeSprint.isPending || createSprint.isPending}
                          disabled={moveToSprintId === '__new__' && !newSprintName.trim()}
                          onClick={async () => {
                            let targetSprintId: string | null = moveToSprintId || null
                            if (moveToSprintId === '__new__' && newSprintName.trim()) {
                              try {
                                const created = await createSprint.mutateAsync({
                                  projectId,
                                  name: newSprintName.trim(),
                                })
                                targetSprintId = created.id
                              } catch { return }
                            }
                            completeSprint.mutate(
                              {
                                projectId,
                                sprintId: sprint.id,
                                moveToSprintId: targetSprintId,
                              },
                              { onSuccess: () => { setShowConfirm(null); setMoveToSprintId(''); setNewSprintName('') } },
                            )
                          }}
                        >
                          {t('sprints.completeSprint')}
                        </Button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={showConfirm === 'delete'}
            onClose={() => setShowConfirm(null)}
            onConfirm={() =>
              deleteSprint.mutate(
                { projectId, sprintId: sprint.id },
                { onSuccess: () => setShowConfirm(null) },
              )
            }
            title={t('sprints.deleteSprint')}
            description={t('sprints.deleteSprintConfirm')}
            confirmLabel={t('common.delete')}
            destructive
            isLoading={deleteSprint.isPending}
          />
        </div>
      )}
    </Droppable>
  )
}

/* ------------------------------------------------------------------ */
/*  Backlog Section                                                    */
/* ------------------------------------------------------------------ */

function BacklogSection({
  issues,
  onCreateIssue,
  statuses,
  onUpdateIssue,
}: {
  issues: Issue[]
  onCreateIssue: () => void
  statuses?: Array<{ id: string; name: string }>
  onUpdateIssue?: (id: string, updates: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const selectAll = useSelectionStore((s) => s.selectAll)

  const backlogIds = issues.map((i) => i.id)
  const allBacklogSelected = backlogIds.length > 0 && backlogIds.every((id) => selectedIssueIds.has(id))
  const someBacklogSelected = backlogIds.some((id) => selectedIssueIds.has(id))

  const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)

  return (
    <Droppable droppableId="backlog" type="ISSUE">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            'border rounded-xl overflow-hidden transition-colors',
            snapshot.isDraggingOver
              ? 'border-primary/50 dark:border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-border',
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {t('sprints.backlog')}
              </h3>
              <span className="text-xs text-muted-foreground">
                {issues.length} {issues.length !== 1 ? 'issues' : 'issue'}
              </span>
              {totalPoints > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-xs font-medium text-foreground">
                  <Target className="h-3 w-3" />
                  {totalPoints} SP
                </span>
              )}
            </div>
          </div>

          <div
            className={cn(
              'min-h-[48px] transition-colors',
              snapshot.isDraggingOver && 'bg-primary/5 dark:bg-primary/10',
            )}
          >
            {issues.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-8" />
                    <th className="px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={allBacklogSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someBacklogSelected && !allBacklogSelected
                        }}
                        onChange={() => selectAll(backlogIds)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                      />
                    </th>
                    <th colSpan={6} />
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue, index) => (
                    <DraggableIssueRow key={issue.id} issue={issue} index={index} selectable />
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title={t('sprints.backlogEmpty')}
                description={t('sprints.backlogEmptyDesc')}
                action={{ label: t('issues.createIssue'), onClick: onCreateIssue }}
              />
            )}
          </div>
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function ProjectBacklogPage() {
  const { t } = useTranslation()
  const { key: projectKey } = useParams<{ key: string }>()
  const qc = useQueryClient()
  const [showCreateIssue, setShowCreateIssue] = useState(false)
  const issueFormRef = useRef<IssueFormHandle>(null)
  const [showCreateSprint, setShowCreateSprint] = useState(false)
  const [sprintName, setSprintName] = useState('')
  const [sprintGoal, setSprintGoal] = useState('')

  const { data: project } = useProject(projectKey!)
  const { data: projectsResult } = useProjects()
  const projects = projectsResult?.data
  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectKey!)
  const { data: board } = useBoard(projectKey!)
  const { data: usersResult } = useUsers()
  const users = usersResult?.data
  const { data: issuesData, isLoading: issuesLoading } = useIssues({ projectId: projectKey! })
  const createSprint = useCreateSprint()
  const createIssue = useCreateIssue()
  const updateIssue = useUpdateIssue()
  const moveIssue = useMoveIssueSprint()

  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const clearSelection = useSelectionStore((s) => s.clearSelection)

  const allIssues = issuesData?.data || []

  const activeSprints = useMemo(
    () => sprints?.filter((s) => s.status !== SprintStatus.COMPLETED) || [],
    [sprints],
  )

  const getSprintIssues = useCallback(
    (sprintId: string) => allIssues.filter((i) => i.sprintId === sprintId),
    [allIssues],
  )

  const backlogIssues = useMemo(
    () => allIssues.filter((i) => !i.sprintId),
    [allIssues],
  )

  const boardStatuses = useMemo(
    () => board?.statuses?.map((s) => ({ id: s.id, name: s.name })) || [],
    [board],
  )

  const handleInlineUpdate = useCallback(
    (issueId: string, updates: Record<string, unknown>) => {
      updateIssue.mutate({ id: issueId, ...updates } as Parameters<typeof updateIssue.mutate>[0])
    },
    [updateIssue],
  )

  // Clear selection on unmount
  useEffect(() => {
    return () => clearSelection()
  }, [clearSelection])

  /* ---- Drag-and-drop handler ---- */
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result

      if (!destination) return
      if (destination.droppableId === source.droppableId && destination.index === source.index) return

      const sourceSprintId = source.droppableId === 'backlog' ? null : source.droppableId
      const destSprintId = destination.droppableId === 'backlog' ? null : destination.droppableId

      // Only fire API call if the sprint changed
      if (sourceSprintId !== destSprintId) {
        // Optimistic update: mutate the cached issues data
        qc.setQueryData(['issues', { projectId: projectKey! }], (old: any) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.map((issue: Issue) =>
              issue.id === draggableId ? { ...issue, sprintId: destSprintId } : issue,
            ),
          }
        })

        // Fire the update (silent — no toast)
        moveIssue.mutate(
          { id: draggableId, sprintId: destSprintId },
          {
            onError: () => {
              // Revert on error
              qc.invalidateQueries({ queryKey: ['issues'] })
            },
            onSuccess: () => {
              qc.invalidateQueries({ queryKey: ['sprints', projectKey] })
            },
          },
        )
      }
    },
    [projectKey, qc, moveIssue],
  )

  if (sprintsLoading || issuesLoading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('nav.backlog')}
        breadcrumbs={[
          { label: t('nav.projects'), href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: t('nav.backlog') },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreateSprint(true)}>
              <Plus className="h-4 w-4" />
              {t('sprints.createSprint')}
            </Button>
            <Button size="sm" onClick={() => setShowCreateIssue(true)}>
              <Plus className="h-4 w-4" />
              {t('issues.createIssue')}
            </Button>
          </div>
        }
      />

      <ProjectTabNav projectKey={projectKey!} />

      {/* Drag-and-Drop Context */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          {/* Summary Bar */}
          {activeSprints.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground px-4 py-2.5 rounded-xl border border-border bg-card">
              <span>
                {activeSprints.length} {activeSprints.length === 1 ? 'sprint' : 'sprints'}
              </span>
              <span className="text-muted-foreground/60">•</span>
              <span>{allIssues.length} total issues</span>
              <span className="text-muted-foreground/60">•</span>
              <span>{backlogIssues.length} in backlog</span>
              <span className="text-muted-foreground/60">•</span>
              <span className="text-primary font-medium">
                Drag issues between sprints to plan
              </span>
            </div>
          )}

          {/* Sprint Sections */}
          {activeSprints.map((sprint) => (
            <SprintSection
              key={sprint.id}
              sprint={sprint}
              issues={getSprintIssues(sprint.id)}
              projectId={projectKey!}
              statuses={boardStatuses}
              onUpdateIssue={handleInlineUpdate}
            />
          ))}

          {/* Backlog Section */}
          <BacklogSection
            issues={backlogIssues}
            onCreateIssue={() => setShowCreateIssue(true)}
            statuses={boardStatuses}
            onUpdateIssue={handleInlineUpdate}
          />
        </div>
      </DragDropContext>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        statuses={board?.statuses}
        users={users}
        projects={projects}
        sprints={activeSprints.map((s) => ({ id: s.id, name: s.name }))}
        projectId={projectKey}
      />

      {/* Create Sprint Dialog */}
      <Dialog
        open={showCreateSprint}
        onOpenChange={(o) => !o && setShowCreateSprint(false)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('sprints.createSprint')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              label={t('sprints.sprintName')}
              placeholder={`Sprint ${(sprints?.length || 0) + 1}`}
              value={sprintName}
              onChange={(e) => setSprintName(e.target.value)}
            />
            <Textarea
              label="Sprint Goal (optional)"
              placeholder="What do you want to achieve in this sprint?"
              value={sprintGoal}
              onChange={(e) => setSprintGoal(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateSprint(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                isLoading={createSprint.isPending}
                onClick={() =>
                  createSprint.mutate(
                    {
                      projectId: projectKey!,
                      name: sprintName || `Sprint ${(sprints?.length || 0) + 1}`,
                      goal: sprintGoal || undefined,
                    },
                    {
                      onSuccess: () => {
                        setShowCreateSprint(false)
                        setSprintName('')
                        setSprintGoal('')
                      },
                    },
                  )
                }
              >
                {t('common.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Issue Dialog */}
      <Dialog
        open={showCreateIssue}
        onOpenChange={(o) => !o && issueFormRef.current?.requestClose()}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('issues.createIssue')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <IssueForm
              ref={issueFormRef}
              projectId={project?.id || projectKey!}
              statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
              sprints={activeSprints.map((s) => ({ id: s.id, name: s.name }))}
              parentIssues={allIssues.map((i) => ({
                id: i.id,
                key: i.key,
                title: i.title,
                type: i.type,
              }))}
              users={users || []}
              onSubmit={(values) =>
                createIssue.mutate(
                  { ...values, projectId: project?.id || projectKey! } as any,
                  { onSuccess: () => setShowCreateIssue(false) },
                )
              }
              onCancel={() => setShowCreateIssue(false)}
              isLoading={createIssue.isPending}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
