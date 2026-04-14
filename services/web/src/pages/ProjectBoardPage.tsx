import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBoard, useReorderIssues, useUpdateStatus, useCreateStatus, useDeleteStatus } from '@/hooks/useBoard'
import { useProject, useProjectMembers } from '@/hooks/useProjects'
import { useCreateIssue } from '@/hooks/useIssues'
import { useSprints, useCompleteSprint, useCreateSprint } from '@/hooks/useSprints'
import { useUsers } from '@/hooks/useUsers'
import { useHasPermission } from '@/hooks/useHasPermission'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'
import { BoardColumn } from '@/components/board/board-column'
import { BoardQuickFilters } from '@/components/board/board-filters'
import { BoardSwimlane, groupIssuesBySwimlane } from '@/components/board/board-swimlane'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { IssueForm, IssueFormHandle } from '@/components/issues/issue-form'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { KanbanSkeleton, ContentFade } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { BoardData, BoardFilters, ColumnPageResult, SwimlaneGroupBy, Issue } from '@/types'
import { toast } from '@/store/ui.store'

const CATEGORY_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
]

const COLOR_PRESETS = [
  '#6b7280', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#ef4444', '#06b6d4',
]

export function ProjectBoardPage() {
  const { t } = useTranslation()
  const { key: projectKey } = useParams<{ key: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createStatusId, setCreateStatusId] = useState<string | undefined>()
  const issueFormRef = useRef<IssueFormHandle>(null)
  const [groupBy, setGroupBy] = useState<SwimlaneGroupBy>('none')

  // Column management dialogs
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnCategory, setNewColumnCategory] = useState('todo')
  const [newColumnColor, setNewColumnColor] = useState('#6b7280')

  const [editColumnId, setEditColumnId] = useState<string | null>(null)
  const [editColumnName, setEditColumnName] = useState('')
  const [editColumnCategory, setEditColumnCategory] = useState('todo')
  const [editColumnColor, setEditColumnColor] = useState('#6b7280')

  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null)
  const [showCompleteSprint, setShowCompleteSprint] = useState(false)
  const [boardMoveToSprintId, setBoardMoveToSprintId] = useState('')
  const [boardNewSprintName, setBoardNewSprintName] = useState('')

  // Load-more state: extra issues appended per column beyond the first page
  const [extraIssues, setExtraIssues] = useState<Record<string, Issue[]>>({})
  const [loadingMoreColumn, setLoadingMoreColumn] = useState<string | null>(null)

  // Derive filters from URL search params
  const filters: BoardFilters = useMemo(() => {
    const f: BoardFilters = {}
    const assigneeId = searchParams.get('assigneeId')
    const type = searchParams.get('type')
    const priority = searchParams.get('priority')
    const label = searchParams.get('label')
    const search = searchParams.get('search')
    const sprintId = searchParams.get('sprintId')
    if (assigneeId) f.assigneeId = assigneeId
    if (type) f.type = type
    if (priority) f.priority = priority
    if (label) f.label = label
    if (search) f.search = search
    if (sprintId) f.sprintId = sprintId
    return f
  }, [searchParams])

  const handleFiltersChange = useCallback(
    (newFilters: BoardFilters) => {
      const params = new URLSearchParams()
      if (newFilters.assigneeId) params.set('assigneeId', newFilters.assigneeId)
      if (newFilters.type) params.set('type', newFilters.type)
      if (newFilters.priority) params.set('priority', newFilters.priority)
      if (newFilters.label) params.set('label', newFilters.label)
      if (newFilters.search) params.set('search', newFilters.search)
      if (newFilters.sprintId) params.set('sprintId', newFilters.sprintId)
      setSearchParams(params, { replace: true })
      // Reset load-more state when filters change
      setExtraIssues({})
    },
    [setSearchParams],
  )

  const { data: project } = useProject(projectKey!)
  const { hasPermission } = useHasPermission(projectKey)
  const { data: sprints } = useSprints(projectKey!)
  const { data: members } = useProjectMembers(projectKey!)
  const { data: usersResult } = useUsers()
  const orgUsers = usersResult?.data
  const reorderIssues = useReorderIssues()
  const createIssue = useCreateIssue()
  const updateStatus = useUpdateStatus()
  const createStatus = useCreateStatus()
  const deleteStatus = useDeleteStatus()
  const completeSprint = useCompleteSprint()
  const createSprintMutation = useCreateSprint()

  // Auto-apply active sprint filter on first load if no sprintId is in the URL
  useEffect(() => {
    if (!sprints || filters.sprintId) return
    const active = sprints.find((s) => s.status === 'active')
    if (active) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('sprintId', active.id)
        return next
      }, { replace: true })
    }
  }, [sprints, filters.sprintId, setSearchParams])

  const { data: board, isLoading } = useBoard(projectKey!, filters)

  const handleLoadMore = useCallback(
    async (statusId: string) => {
      if (!projectKey || loadingMoreColumn === statusId) return
      const col = board?.statuses.find((c) => c.id === statusId)
      if (!col) return

      const currentExtra = extraIssues[statusId] ?? []
      const offset = col.issues.length + currentExtra.length

      setLoadingMoreColumn(statusId)
      try {
        const params = new URLSearchParams()
        if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
        if (filters.type) params.set('type', filters.type)
        if (filters.priority) params.set('priority', filters.priority)
        if (filters.label) params.set('label', filters.label)
        if (filters.search) params.set('search', filters.search)
        if (filters.sprintId) params.set('sprintId', filters.sprintId)
        params.set('offset', String(offset))
        params.set('columnLimit', '50')

        const { data } = await api.get(
          `/projects/${projectKey}/board/columns/${statusId}/issues?${params.toString()}`,
        )
        const result = data.data as ColumnPageResult

        setExtraIssues((prev) => ({
          ...prev,
          [statusId]: [...(prev[statusId] ?? []), ...result.issues],
        }))
      } catch {
        toast('Failed to load more issues', 'error')
      } finally {
        setLoadingMoreColumn(null)
      }
    },
    [projectKey, board, extraIssues, filters, loadingMoreColumn],
  )

  // Socket.io real-time updates
  useEffect(() => {
    if (!projectKey) return
    const socket = getSocket()
    socket.emit('join:project', projectKey)
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['board', projectKey] })
      // Reset load-more state on live updates so stale extra pages don't linger
      setExtraIssues({})
    }
    socket.on('issue:updated', refresh)
    socket.on('issue:created', refresh)
    return () => {
      socket.off('issue:updated', refresh)
      socket.off('issue:created', refresh)
      socket.emit('leave:project', projectKey)
    }
  }, [projectKey, qc])

  // Collect all issues from the board into a flat array (including load-more pages)
  const allIssues = useMemo(() => {
    if (!board) return []
    return board.statuses.flatMap((col) => [
      ...col.issues,
      ...(extraIssues[col.id] ?? []),
    ])
  }, [board, extraIssues])

  // Swimlane groups
  const swimlaneGroups = useMemo(() => {
    if (groupBy === 'none') return []
    return groupIssuesBySwimlane(allIssues, groupBy)
  }, [allIssues, groupBy])

  // Check WIP limit for a column (accounts for load-more extra issues)
  const isWipExceeded = useCallback(
    (columnId: string, extraCount = 0) => {
      if (!board) return false
      const col = board.statuses.find((c) => c.id === columnId)
      if (!col || !col.wipLimit || col.wipLimit <= 0) return false
      const displayedCount = col.issues.length + (extraIssues[columnId]?.length ?? 0)
      return displayedCount + extraCount >= col.wipLimit
    },
    [board, extraIssues],
  )

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, type } = result

    if (!destination) return

    // Column reorder
    if (type === 'COLUMN') {
      if (destination.index === source.index) return

      const boardData = qc.getQueryData<BoardData>(['board', projectKey, filters])
      if (!boardData) return

      const newStatuses = [...boardData.statuses]
      const [moved] = newStatuses.splice(source.index, 1)
      newStatuses.splice(destination.index, 0, moved)

      // Optimistic update
      qc.setQueryData<BoardData>(['board', projectKey, filters], { statuses: newStatuses })

      // Batch update positions for affected columns
      const updates = newStatuses
        .map((col, index) => ({ col, index }))
        .filter(({ col, index }) => col.position !== index)

      Promise.all(
        updates.map(({ col, index }) =>
          api.patch(`/projects/${projectKey}/statuses/${col.id}`, { position: index })
        )
      ).then(() => {
        qc.invalidateQueries({ queryKey: ['board', projectKey] })
      }).catch(() => {
        toast('Failed to reorder columns', 'error')
        qc.invalidateQueries({ queryKey: ['board', projectKey] })
      })
      return
    }

    // Issue reorder (existing logic)
    const { draggableId } = result

    // When swimlanes are active, droppableId has format "columnId::swimlaneKey"
    const sourceColumnId = source.droppableId.split('::')[0]
    const destColumnId = destination.droppableId.split('::')[0]

    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const boardData = qc.getQueryData<BoardData>(['board', projectKey, filters])
    if (!boardData) return

    // Check WIP limit before allowing move
    if (sourceColumnId !== destColumnId) {
      const destCol = boardData.statuses.find((c) => c.id === destColumnId)
      const destDisplayedCount = (destCol?.issues.length ?? 0) + (extraIssues[destColumnId]?.length ?? 0)
      if (destCol && destCol.wipLimit > 0 && destDisplayedCount >= destCol.wipLimit) {
        toast(
          `WIP limit reached for "${destCol.name}" (${destDisplayedCount}/${destCol.wipLimit})`,
          'error',
        )
        return
      }
    }

    // Merge extra (load-more) issues so drag-and-drop sees the full displayed set
    const newStatuses = boardData.statuses.map((col) => ({
      ...col,
      issues: [...col.issues, ...(extraIssues[col.id] ?? [])],
    }))

    const sourceCol = newStatuses.find((c) => c.id === sourceColumnId)
    const destCol = newStatuses.find((c) => c.id === destColumnId)
    if (!sourceCol || !destCol) return

    // Find the issue in the source column
    const issueIndex = sourceCol.issues.findIndex((i) => i.id === draggableId)
    if (issueIndex === -1) return

    const [movedIssue] = sourceCol.issues.splice(issueIndex, 1)
    const updatedIssue = { ...movedIssue, statusId: destCol.id, status: destCol }

    destCol.issues.splice(destination.index, 0, updatedIssue)

    // Clear extra issues to prevent duplication (they've been merged above)
    setExtraIssues({})

    // Optimistic update
    qc.setQueryData<BoardData>(['board', projectKey, filters], { statuses: newStatuses })

    // Build updates for all affected columns
    const updates = destCol.issues.map((issue, index) => ({
      issueId: issue.id,
      statusId: destCol.id,
      position: index,
    }))

    // Also update source column positions if cross-column move
    if (sourceColumnId !== destColumnId) {
      sourceCol.issues.forEach((issue, index) => {
        updates.push({
          issueId: issue.id,
          statusId: sourceCol.id,
          position: index,
        })
      })
    }

    reorderIssues.mutate({ projectId: projectKey!, items: updates }, {
      onError: () => {
        qc.invalidateQueries({ queryKey: ['board', projectKey] })
      },
    })
  }

  const handleAddIssue = (statusId: string) => {
    setCreateStatusId(statusId)
    setShowCreateDialog(true)
  }

  const handleUpdateWipLimit = (statusId: string, wipLimit: number) => {
    updateStatus.mutate({
      projectId: projectKey!,
      statusId,
      wipLimit,
    } as any)
  }

  const handleEditColumn = (statusId: string) => {
    const col = board?.statuses.find((c) => c.id === statusId)
    if (!col) return
    setEditColumnId(statusId)
    setEditColumnName(col.name)
    setEditColumnCategory(col.category || 'todo')
    setEditColumnColor(col.color || '#6b7280')
  }

  const handleSaveEditColumn = () => {
    if (!editColumnId || !editColumnName.trim()) return
    updateStatus.mutate(
      { projectId: projectKey!, statusId: editColumnId, name: editColumnName.trim(), category: editColumnCategory, color: editColumnColor } as any,
      { onSuccess: () => setEditColumnId(null) },
    )
  }

  const handleDeleteColumn = (statusId: string) => {
    setDeleteColumnId(statusId)
  }

  const handleConfirmDelete = () => {
    if (!deleteColumnId) return
    deleteStatus.mutate(
      { projectId: projectKey!, statusId: deleteColumnId },
      { onSuccess: () => setDeleteColumnId(null) },
    )
  }

  const handleAddColumn = () => {
    if (!newColumnName.trim()) return
    createStatus.mutate(
      { projectId: projectKey!, name: newColumnName.trim(), category: newColumnCategory, color: newColumnColor },
      {
        onSuccess: () => {
          setShowAddColumn(false)
          setNewColumnName('')
          setNewColumnCategory('todo')
          setNewColumnColor('#6b7280')
        },
      },
    )
  }

  const activeSprints = sprints?.filter((s) => s.status === 'active') || []
  const deleteColumn = board?.statuses.find((c) => c.id === deleteColumnId)

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project?.name || t('board.title')}
        breadcrumbs={[
          { label: t('nav.projects'), href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: t('nav.board') },
        ]}
        actions={
          hasPermission('issue', 'create') ? (
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              {t('issues.createIssue')}
            </Button>
          ) : undefined
        }
      />

      {activeSprints.length > 0 && (
        <div className="flex items-center justify-between px-6 py-2.5 bg-primary/5 border-b border-primary/20">
          <p className="text-sm font-medium text-primary">
            {t('board.activeSprint', { name: activeSprints[0].name })}
            {activeSprints[0].endDate && (
              <span className="text-primary dark:text-primary ml-2">
                {t('board.endsOn', { date: new Date(activeSprints[0].endDate).toLocaleDateString() })}
              </span>
            )}
          </p>
          {hasPermission('sprint', 'manage') && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowCompleteSprint(true)}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {t('sprints.complete')}
            </Button>
          )}
        </div>
      )}

      <ProjectTabNav projectKey={projectKey!} />

      {/* Quick Filters Bar */}
      <BoardQuickFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        members={members || []}
        sprints={sprints || []}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        projectType={project?.type}
      />

      {/* Board */}
      {isLoading ? <KanbanSkeleton /> : !board || board.statuses.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <EmptyState
            title={t('board.noColumns')}
            description={t('board.noColumnsDesc')}
          />
          {hasPermission('board', 'manage') && (
            <Button onClick={() => setShowAddColumn(true)}>
              <Plus className="h-4 w-4" />
              Add Column
            </Button>
          )}
        </div>
      ) : groupBy !== 'none' ? (
        /* Swimlane View */
        <ContentFade><DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-auto">
            {/* Column Headers (sticky) */}
            <div className="flex gap-4 px-6 pt-4 pb-2 bg-card border-b border-border sticky top-0 z-10">
              {board.statuses.map((column) => {
                const wipLimit = column.wipLimit || 0
                const totalIssues = column.issues.length
                const isOver = wipLimit > 0 && totalIssues > wipLimit
                const isAt = wipLimit > 0 && totalIssues >= wipLimit

                return (
                  <div key={column.id} className="w-72 flex-shrink-0">
                    <div
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg',
                        isOver && 'bg-red-50 border border-red-200',
                        isAt && !isOver && 'bg-amber-50 border border-amber-200',
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: column.color || '#6b7280' }}
                      />
                      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide truncate">
                        {column.name}
                      </h3>
                      <span
                        className={cn(
                          'text-xs font-medium rounded-full px-1.5 py-0.5',
                          isOver
                            ? 'text-red-700 bg-red-100'
                            : isAt
                              ? 'text-amber-700 bg-amber-100'
                              : 'text-muted-foreground bg-muted',
                        )}
                      >
                        {wipLimit > 0 ? `${totalIssues}/${wipLimit}` : totalIssues}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Swimlane rows */}
            {swimlaneGroups.length > 0 ? (
              swimlaneGroups.map((group) => (
                <BoardSwimlane
                  key={group.key}
                  group={group}
                  columns={board.statuses}
                  onAddIssue={handleAddIssue}
                  isWipExceeded={isWipExceeded}
                />
              ))
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No issues match the current filters
              </div>
            )}
          </div>
        </DragDropContext></ContentFade>
      ) : (
        /* Standard Board View */
        <ContentFade><DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board-columns" type="COLUMN" direction="horizontal">
            {(provided) => (
              <div
                className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 bg-background"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                <div
                  className="flex gap-3 p-4 h-full"
                  style={{ minWidth: `${board.statuses.length * 296 + 312}px` }}
                >
                  {board.statuses.map((column, index) => (
                    <Draggable key={column.id} draggableId={`col-${column.id}`} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={cn(
                            'flex flex-col h-full',
                            dragSnapshot.isDragging && 'opacity-90 rotate-1',
                          )}
                        >
                          <BoardColumn
                            column={column}
                            extraIssues={extraIssues[column.id] ?? []}
                            dragHandleProps={dragProvided.dragHandleProps}
                            onAddIssue={handleAddIssue}
                            onUpdateWipLimit={handleUpdateWipLimit}
                            onEditColumn={handleEditColumn}
                            onDeleteColumn={board.statuses.length > 1 ? handleDeleteColumn : undefined}
                            onLoadMore={handleLoadMore}
                            isLoadingMore={loadingMoreColumn === column.id}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}

                  {/* Add Column Button */}
                  {hasPermission('board', 'manage') && (
                  <button
                    onClick={() => setShowAddColumn(true)}
                    className="flex flex-col items-center justify-center w-[280px] flex-shrink-0 min-h-[200px] rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                  >
                    <Plus className="h-6 w-6 mb-1" />
                    <span className="text-sm font-medium">Add Column</span>
                  </button>
                  )}
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext></ContentFade>
      )}

      {/* Create Issue Dialog */}
      <Dialog
        open={showCreateDialog}
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
              sprints={sprints?.map((s) => ({ id: s.id, name: s.name }))}
              parentIssues={allIssues.map((i) => ({
                id: i.id,
                key: i.key,
                title: i.title,
                type: i.type,
              }))}
              users={orgUsers || []}
              defaultValues={{ statusId: createStatusId }}
              onSubmit={(values) => {
                createIssue.mutate(
                  { ...values, projectId: project?.id || projectKey! } as any,
                  {
                    onSuccess: () => {
                      setShowCreateDialog(false)
                      setCreateStatusId(undefined)
                    },
                  },
                )
              }}
              onCancel={() => {
                setShowCreateDialog(false)
                setCreateStatusId(undefined)
              }}
              isLoading={createIssue.isPending}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={showAddColumn} onOpenChange={(o) => !o && setShowAddColumn(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Column Name"
              placeholder="e.g. In Review"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
            />
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <Select value={newColumnCategory} onValueChange={setNewColumnCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColumnColor(color)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all',
                      newColumnColor === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddColumn(false)}>Cancel</Button>
            <Button onClick={handleAddColumn} disabled={!newColumnName.trim()} isLoading={createStatus.isPending}>
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog open={!!editColumnId} onOpenChange={(o) => !o && setEditColumnId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Column Name"
              value={editColumnName}
              onChange={(e) => setEditColumnName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEditColumn()}
            />
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <Select value={editColumnCategory} onValueChange={setEditColumnCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditColumnColor(color)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all',
                      editColumnColor === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditColumnId(null)}>Cancel</Button>
            <Button onClick={handleSaveEditColumn} disabled={!editColumnName.trim()} isLoading={updateStatus.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Column Confirmation */}
      <ConfirmDialog
        open={!!deleteColumnId}
        onClose={() => setDeleteColumnId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Column"
        description={
          deleteColumn
            ? `Are you sure you want to delete "${deleteColumn.name}"? ${deleteColumn.issues.length > 0 ? `${deleteColumn.issues.length} issue(s) will be moved to the first column.` : 'This column is empty.'}`
            : ''
        }
        confirmLabel="Delete"
        destructive
        isLoading={deleteStatus.isPending}
      />

      {/* Complete Sprint Dialog */}
      {activeSprints.length > 0 && (
        <Dialog
          open={showCompleteSprint}
          onOpenChange={(o) => !o && (setShowCompleteSprint(false), setBoardMoveToSprintId(''))}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('sprints.completeSprint')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {(() => {
                const doneCount = board?.statuses
                  .filter((s) => s.category === 'done')
                  .reduce((sum, s) => sum + s.issues.length, 0) ?? 0
                const totalCount = board?.statuses.reduce((sum, s) => sum + s.issues.length, 0) ?? 0
                const incompleteCount = totalCount - doneCount
                const otherSprints = sprints?.filter(
                  (s) => s.id !== activeSprints[0].id && s.status !== 'completed',
                ) || []
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
                          value={boardMoveToSprintId || '__backlog__'}
                          onValueChange={(v) => { setBoardMoveToSprintId(v === '__backlog__' ? '' : v); if (v !== '__new__') setBoardNewSprintName('') }}
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
                        {boardMoveToSprintId === '__new__' && (
                          <Input
                            placeholder="New sprint name"
                            value={boardNewSprintName}
                            onChange={(e) => setBoardNewSprintName(e.target.value)}
                            autoFocus
                          />
                        )}
                        <p className="text-xs text-muted-foreground">
                          {boardMoveToSprintId === '__new__'
                            ? 'A new sprint will be created and incomplete issues moved to it.'
                            : boardMoveToSprintId
                              ? `Incomplete issues will be moved to the selected sprint.`
                              : `Incomplete issues will be moved to the backlog.`}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => { setShowCompleteSprint(false); setBoardMoveToSprintId(''); setBoardNewSprintName('') }}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        isLoading={completeSprint.isPending || createSprintMutation.isPending}
                        disabled={boardMoveToSprintId === '__new__' && !boardNewSprintName.trim()}
                        onClick={async () => {
                          let targetSprintId: string | null = boardMoveToSprintId || null
                          if (boardMoveToSprintId === '__new__' && boardNewSprintName.trim()) {
                            try {
                              const created = await createSprintMutation.mutateAsync({
                                projectId: project?.id || projectKey!,
                                name: boardNewSprintName.trim(),
                              })
                              targetSprintId = created.id
                            } catch { return }
                          }
                          completeSprint.mutate(
                            {
                              projectId: project?.id || projectKey!,
                              sprintId: activeSprints[0].id,
                              moveToSprintId: targetSprintId,
                            },
                            { onSuccess: () => { setShowCompleteSprint(false); setBoardMoveToSprintId(''); setBoardNewSprintName('') } },
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
      )}
    </div>
  )
}
