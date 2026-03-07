import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBoard, useReorderIssues, useUpdateStatus } from '@/hooks/useBoard'
import { useProject, useProjectMembers } from '@/hooks/useProjects'
import { useCreateIssue } from '@/hooks/useIssues'
import { useSprints } from '@/hooks/useSprints'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'
import { BoardColumn } from '@/components/board/board-column'
import { BoardQuickFilters } from '@/components/board/board-filters'
import { BoardSwimlane, groupIssuesBySwimlane } from '@/components/board/board-swimlane'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { IssueForm } from '@/components/issues/issue-form'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { BoardData, BoardFilters, SwimlaneGroupBy, Issue } from '@/types'
import { toast } from '@/store/ui.store'

export function ProjectBoardPage() {
  const { t } = useTranslation()
  const { id: projectId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createStatusId, setCreateStatusId] = useState<string | undefined>()
  const [groupBy, setGroupBy] = useState<SwimlaneGroupBy>('none')

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
    },
    [setSearchParams],
  )

  const { data: project } = useProject(projectId!)
  const { data: board, isLoading } = useBoard(projectId!, filters)
  const { data: sprints } = useSprints(projectId!)
  const { data: members } = useProjectMembers(projectId!)
  const reorderIssues = useReorderIssues()
  const createIssue = useCreateIssue()
  const updateStatus = useUpdateStatus()

  // Socket.io real-time updates
  useEffect(() => {
    if (!projectId) return
    const socket = getSocket()
    socket.emit('join:project', projectId)
    socket.on('issue:updated', () => {
      qc.invalidateQueries({ queryKey: ['board', projectId] })
    })
    socket.on('issue:created', () => {
      qc.invalidateQueries({ queryKey: ['board', projectId] })
    })
    return () => {
      socket.off('issue:updated')
      socket.off('issue:created')
      socket.emit('leave:project', projectId)
    }
  }, [projectId, qc])

  // Collect all issues from the board into a flat array
  const allIssues = useMemo(() => {
    if (!board) return []
    return board.statuses.flatMap((col) => col.issues)
  }, [board])

  // Swimlane groups
  const swimlaneGroups = useMemo(() => {
    if (groupBy === 'none') return []
    return groupIssuesBySwimlane(allIssues, groupBy)
  }, [allIssues, groupBy])

  // Check WIP limit for a column
  const isWipExceeded = useCallback(
    (columnId: string, extraCount = 0) => {
      if (!board) return false
      const col = board.statuses.find((c) => c.id === columnId)
      if (!col || !col.wipLimit || col.wipLimit <= 0) return false
      return col.issues.length + extraCount >= col.wipLimit
    },
    [board],
  )

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result

    if (!destination) return

    // When swimlanes are active, droppableId has format "columnId::swimlaneKey"
    const sourceColumnId = source.droppableId.split('::')[0]
    const destColumnId = destination.droppableId.split('::')[0]

    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const boardData = qc.getQueryData<BoardData>(['board', projectId, filters])
    if (!boardData) return

    // Check WIP limit before allowing move
    if (sourceColumnId !== destColumnId) {
      const destCol = boardData.statuses.find((c) => c.id === destColumnId)
      if (destCol && destCol.wipLimit > 0 && destCol.issues.length >= destCol.wipLimit) {
        toast(
          `WIP limit reached for "${destCol.name}" (${destCol.issues.length}/${destCol.wipLimit})`,
          'error',
        )
        return
      }
    }

    const newStatuses = boardData.statuses.map((col) => ({ ...col, issues: [...col.issues] }))

    const sourceCol = newStatuses.find((c) => c.id === sourceColumnId)
    const destCol = newStatuses.find((c) => c.id === destColumnId)
    if (!sourceCol || !destCol) return

    // Find the issue in the source column
    const issueIndex = sourceCol.issues.findIndex((i) => i.id === draggableId)
    if (issueIndex === -1) return

    const [moved] = sourceCol.issues.splice(issueIndex, 1)
    const updatedIssue = { ...moved, statusId: destCol.id, status: destCol }

    // For swimlane mode, we need to figure out the correct destination index
    // within the full column (not just the swimlane subset)
    if (sourceColumnId === destColumnId) {
      destCol.issues.splice(destination.index, 0, updatedIssue)
    } else {
      destCol.issues.splice(destination.index, 0, updatedIssue)
    }

    // Optimistic update
    qc.setQueryData<BoardData>(['board', projectId, filters], { statuses: newStatuses })

    // Build updates for all affected issues in destination column
    const updates = destCol.issues.map((issue, index) => ({
      issueId: issue.id,
      statusId: destCol.id,
      position: index,
    }))

    reorderIssues.mutate(updates, {
      onError: () => {
        // Rollback
        qc.invalidateQueries({ queryKey: ['board', projectId] })
      },
    })
  }

  const handleAddIssue = (statusId: string) => {
    setCreateStatusId(statusId)
    setShowCreateDialog(true)
  }

  const handleUpdateWipLimit = (statusId: string, wipLimit: number) => {
    updateStatus.mutate({
      projectId: projectId!,
      statusId,
      wipLimit,
    } as any)
  }

  if (isLoading) return <LoadingPage />

  const activeSprints = sprints?.filter((s) => s.status === 'active') || []

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project?.name || t('board.title')}
        breadcrumbs={[
          { label: t('nav.projects'), href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
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
          { label: t('nav.board'), href: `/projects/${projectId}/board` },
          { label: t('nav.backlog'), href: `/projects/${projectId}/backlog` },
          { label: t('nav.issues'), href: `/projects/${projectId}/issues` },
          { label: 'Trash', href: `/projects/${projectId}/trash` },
          { label: 'Automations', href: `/projects/${projectId}/automations` },
          { label: t('nav.settings'), href: `/projects/${projectId}/settings` },
        ].map((tab) => (
          <Link
            key={tab.href}
            to={tab.href}
            className="px-3 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600 -mb-px"
          >
            {tab.label}
          </Link>
        ))}
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
        <EmptyState
          title={t('board.noColumns')}
          description={t('board.noColumnsDesc')}
        />
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
              <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                No issues match the current filters
              </div>
            )}
          </div>
        </DragDropContext>
      ) : (
        /* Standard Board View */
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 p-6 h-full min-h-[calc(100vh-200px)]">
              {board.statuses.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  onAddIssue={handleAddIssue}
                  onUpdateWipLimit={handleUpdateWipLimit}
                />
              ))}
            </div>
          </div>
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
            projectId={projectId!}
            statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
            sprints={sprints?.map((s) => ({ id: s.id, name: s.name }))}
            defaultValues={{ statusId: createStatusId }}
            onSubmit={(values) => {
              createIssue.mutate(
                { ...values, projectId: projectId! } as any,
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
    </div>
  )
}
