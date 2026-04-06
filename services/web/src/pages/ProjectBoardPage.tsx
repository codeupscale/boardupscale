import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, Link, useSearchParams, useLocation } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBoard, useReorderIssues, useUpdateStatus, useCreateStatus, useDeleteStatus } from '@/hooks/useBoard'
import { useProject, useProjectMembers } from '@/hooks/useProjects'
import { useCreateIssue } from '@/hooks/useIssues'
import { useSprints } from '@/hooks/useSprints'
import { useUsers } from '@/hooks/useUsers'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'
import { BoardColumn } from '@/components/board/board-column'
import { BoardQuickFilters } from '@/components/board/board-filters'
import { BoardSwimlane, groupIssuesBySwimlane } from '@/components/board/board-swimlane'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { IssueForm } from '@/components/issues/issue-form'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/spinner'
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
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createStatusId, setCreateStatusId] = useState<string | undefined>()
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
  const { data: board, isLoading } = useBoard(projectKey!, filters)
  const { data: sprints } = useSprints(projectKey!)
  const { data: members } = useProjectMembers(projectKey!)
  const { data: usersResult } = useUsers()
  const orgUsers = usersResult?.data
  const reorderIssues = useReorderIssues()
  const createIssue = useCreateIssue()
  const updateStatus = useUpdateStatus()
  const createStatus = useCreateStatus()
  const deleteStatus = useDeleteStatus()

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

    // Optimistic update
    qc.setQueryData<BoardData>(['board', projectKey, filters], { statuses: newStatuses })

    // Build updates for all affected issues in destination column
    const updates = destCol.issues.map((issue, index) => ({
      issueId: issue.id,
      statusId: destCol.id,
      position: index,
    }))

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

  if (isLoading) return <LoadingPage />

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
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            {t('issues.createIssue')}
          </Button>
        }
      />

      {activeSprints.length > 0 && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
          <p className="text-sm text-blue-700">
            {t('board.activeSprint', { name: activeSprints[0].name })}
            {activeSprints[0].endDate && (
              <span className="text-blue-500 ml-2">
                {t('board.endsOn', { date: new Date(activeSprints[0].endDate).toLocaleDateString() })}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-gray-200 bg-white">
        {[
          { label: t('nav.board'), href: `/projects/${projectKey}/board` },
          { label: t('nav.backlog'), href: `/projects/${projectKey}/backlog` },
          { label: t('nav.issues'), href: `/projects/${projectKey}/issues` },
          { label: 'Calendar', href: `/projects/${projectKey}/calendar` },
          { label: 'Timeline', href: `/projects/${projectKey}/timeline` },
          { label: 'Trash', href: `/projects/${projectKey}/trash` },
          { label: 'Automations', href: `/projects/${projectKey}/automations` },
          { label: t('nav.settings'), href: `/projects/${projectKey}/settings` },
        ].map((tab) => {
          const isActive = location.pathname === tab.href
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

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
      {!board || board.statuses.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <EmptyState
            title={t('board.noColumns')}
            description={t('board.noColumnsDesc')}
          />
          <Button onClick={() => setShowAddColumn(true)}>
            <Plus className="h-4 w-4" />
            Add Column
          </Button>
        </div>
      ) : groupBy !== 'none' ? (
        /* Swimlane View */
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-auto">
            {/* Column Headers (sticky) */}
            <div className="flex gap-4 px-6 pt-4 pb-2 bg-white border-b border-gray-200 sticky top-0 z-10">
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
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide truncate">
                        {column.name}
                      </h3>
                      <span
                        className={cn(
                          'text-xs font-medium rounded-full px-1.5 py-0.5',
                          isOver
                            ? 'text-red-700 bg-red-100'
                            : isAt
                              ? 'text-amber-700 bg-amber-100'
                              : 'text-gray-400 bg-gray-100',
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
              <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                No issues match the current filters
              </div>
            )}
          </div>
        </DragDropContext>
      ) : (
        /* Standard Board View */
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board-columns" type="COLUMN" direction="horizontal">
            {(provided) => (
              <div
                className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 bg-gray-50 dark:bg-gray-950"
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
                  <button
                    onClick={() => setShowAddColumn(true)}
                    className="flex flex-col items-center justify-center w-[280px] flex-shrink-0 min-h-[200px] rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-600 hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all"
                  >
                    <Plus className="h-6 w-6 mb-1" />
                    <span className="text-sm font-medium">Add Column</span>
                  </button>
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Create Issue Dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false)
          setCreateStatusId(undefined)
        }}
        className="max-w-2xl"
      >
        <DialogHeader
          onClose={() => {
            setShowCreateDialog(false)
            setCreateStatusId(undefined)
          }}
        >
          <DialogTitle>{t('issues.createIssue')}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <IssueForm
            projectId={project?.id || projectKey!}
            statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
            sprints={sprints?.map((s) => ({ id: s.id, name: s.name }))}
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
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={showAddColumn} onClose={() => setShowAddColumn(false)} className="max-w-sm">
        <DialogHeader onClose={() => setShowAddColumn(false)}>
          <DialogTitle>Add Column</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <Input
              label="Column Name"
              placeholder="e.g. In Review"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
            />
            <Select
              label="Category"
              options={CATEGORY_OPTIONS}
              value={newColumnCategory}
              onChange={(e) => setNewColumnCategory(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColumnColor(color)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all',
                      newColumnColor === color ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddColumn(false)}>Cancel</Button>
          <Button onClick={handleAddColumn} disabled={!newColumnName.trim()} isLoading={createStatus.isPending}>
            Add Column
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog open={!!editColumnId} onClose={() => setEditColumnId(null)} className="max-w-sm">
        <DialogHeader onClose={() => setEditColumnId(null)}>
          <DialogTitle>Edit Column</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <Input
              label="Column Name"
              value={editColumnName}
              onChange={(e) => setEditColumnName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEditColumn()}
            />
            <Select
              label="Category"
              options={CATEGORY_OPTIONS}
              value={editColumnCategory}
              onChange={(e) => setEditColumnCategory(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditColumnColor(color)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all',
                      editColumnColor === color ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditColumnId(null)}>Cancel</Button>
          <Button onClick={handleSaveEditColumn} disabled={!editColumnName.trim()} isLoading={updateStatus.isPending}>
            Save Changes
          </Button>
        </DialogFooter>
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
    </div>
  )
}
