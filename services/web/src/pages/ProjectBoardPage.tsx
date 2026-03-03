import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useBoard, useReorderIssues } from '@/hooks/useBoard'
import { useProject } from '@/hooks/useProjects'
import { useCreateIssue } from '@/hooks/useIssues'
import { useSprints } from '@/hooks/useSprints'
import { getSocket } from '@/lib/socket'
import { BoardColumn } from '@/components/board/board-column'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { IssueForm } from '@/components/issues/issue-form'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { BoardData } from '@/types'

export function ProjectBoardPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createStatusId, setCreateStatusId] = useState<string | undefined>()

  const { data: project } = useProject(projectId!)
  const { data: board, isLoading } = useBoard(projectId!)
  const { data: sprints } = useSprints(projectId!)
  const reorderIssues = useReorderIssues()
  const createIssue = useCreateIssue()

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

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result

    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const boardData = qc.getQueryData<BoardData>(['board', projectId])
    if (!boardData) return

    const newStatuses = boardData.statuses.map((col) => ({ ...col, issues: [...col.issues] }))

    const sourceCol = newStatuses.find((c) => c.id === source.droppableId)
    const destCol = newStatuses.find((c) => c.id === destination.droppableId)
    if (!sourceCol || !destCol) return

    const [moved] = sourceCol.issues.splice(source.index, 1)
    const updatedIssue = { ...moved, statusId: destCol.id, status: destCol }
    destCol.issues.splice(destination.index, 0, updatedIssue)

    // Optimistic update
    qc.setQueryData<BoardData>(['board', projectId], { statuses: newStatuses })

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

  if (isLoading) return <LoadingPage />

  const activeSprints = sprints?.filter((s) => s.status === 'active') || []

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project?.name || 'Board'}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
          { label: 'Board' },
        ]}
        actions={
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Issue
          </Button>
        }
      />

      {activeSprints.length > 0 && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
          <p className="text-sm text-blue-700">
            Active sprint: <span className="font-semibold">{activeSprints[0].name}</span>
            {activeSprints[0].endDate && (
              <span className="text-blue-500 ml-2">
                — ends {new Date(activeSprints[0].endDate).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-gray-200 bg-white">
        {[
          { label: 'Board', href: `/projects/${projectId}/board` },
          { label: 'Backlog', href: `/projects/${projectId}/backlog` },
          { label: 'Issues', href: `/projects/${projectId}/issues` },
          { label: 'Automations', href: `/projects/${projectId}/automations` },
          { label: 'Settings', href: `/projects/${projectId}/settings` },
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

      {/* Board */}
      {!board || board.statuses.length === 0 ? (
        <EmptyState
          title="No columns configured"
          description="Go to project settings to configure workflow statuses."
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 p-6 h-full min-h-[calc(100vh-200px)]">
              {board.statuses.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  onAddIssue={handleAddIssue}
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
          <DialogTitle>Create Issue</DialogTitle>
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
