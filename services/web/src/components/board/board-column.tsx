import { Droppable } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { BoardColumn as BoardColumnType } from '@/types'
import { cn } from '@/lib/utils'
import { BoardCard } from './board-card'

interface BoardColumnProps {
  column: BoardColumnType
  onAddIssue?: (statusId: string) => void
}

export function BoardColumn({ column, onAddIssue }: BoardColumnProps) {
  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color || '#6b7280' }}
          />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {column.name}
          </h3>
          <span className="text-xs text-gray-400 font-medium bg-gray-100 rounded-full px-1.5 py-0.5">
            {column.issues.length}
          </span>
        </div>
        {onAddIssue && (
          <button
            onClick={() => onAddIssue(column.id)}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Add issue"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Droppable area */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 flex flex-col gap-2 p-2 rounded-xl min-h-[200px] transition-colors',
              snapshot.isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-300' : 'bg-gray-100/50',
            )}
          >
            {column.issues.map((issue, index) => (
              <BoardCard key={issue.id} issue={issue} index={index} />
            ))}
            {provided.placeholder}
            {column.issues.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-20 text-xs text-gray-400">
                No issues
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}
