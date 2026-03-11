import { useState } from 'react'
import { Droppable, DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import { Plus, GripVertical, MoreHorizontal, Pencil, Gauge, Trash2, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BoardColumn as BoardColumnType } from '@/types'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown-menu'
import { BoardCard } from './board-card'
import { WipLimitSettings } from './wip-limit-settings'

interface BoardColumnProps {
  column: BoardColumnType
  dragHandleProps?: DraggableProvidedDragHandleProps | null
  onAddIssue?: (statusId: string) => void
  onUpdateWipLimit?: (statusId: string, wipLimit: number) => void
  onEditColumn?: (statusId: string) => void
  onDeleteColumn?: (statusId: string) => void
}

export function BoardColumn({ column, dragHandleProps, onAddIssue, onUpdateWipLimit, onEditColumn, onDeleteColumn }: BoardColumnProps) {
  const { t } = useTranslation()
  const [showWipSettings, setShowWipSettings] = useState(false)

  const issueCount = column.issues.length
  const wipLimit = column.wipLimit || 0
  const isAtLimit = wipLimit > 0 && issueCount >= wipLimit
  const isOverLimit = wipLimit > 0 && issueCount > wipLimit

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column Header */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2.5 mb-2 rounded-lg transition-colors',
          isOverLimit && 'bg-red-50 border border-red-200',
          isAtLimit && !isOverLimit && 'bg-amber-50 border border-amber-200',
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}
          <span
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color || '#6b7280' }}
          />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide truncate">
            {column.name}
          </h3>
          <span
            className={cn(
              'text-xs font-medium rounded-full px-1.5 py-0.5 flex-shrink-0',
              isOverLimit
                ? 'text-red-700 bg-red-100'
                : isAtLimit
                  ? 'text-amber-700 bg-amber-100'
                  : 'text-gray-400 bg-gray-100',
            )}
          >
            {wipLimit > 0 ? `${issueCount}/${wipLimit}` : issueCount}
          </span>
          {isOverLimit && (
            <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <DropdownMenu
            trigger={
              <button
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title={t('board.columnSettings', 'Column settings')}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
          >
            {onEditColumn && (
              <DropdownItem icon={<Pencil className="h-4 w-4" />} onClick={() => onEditColumn(column.id)}>
                Edit column
              </DropdownItem>
            )}
            {onUpdateWipLimit && (
              <DropdownItem icon={<Gauge className="h-4 w-4" />} onClick={() => setShowWipSettings(true)}>
                WIP limit{wipLimit > 0 ? ` (${wipLimit})` : ''}
              </DropdownItem>
            )}
            {onDeleteColumn && (
              <>
                <DropdownSeparator />
                <DropdownItem
                  icon={<Trash2 className="h-4 w-4" />}
                  destructive
                  onClick={() => onDeleteColumn(column.id)}
                >
                  Delete column
                </DropdownItem>
              </>
            )}
          </DropdownMenu>
          {onAddIssue && (
            <button
              onClick={() => onAddIssue(column.id)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title={t('issues.addIssue')}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* WIP Limit Settings Popover */}
      {showWipSettings && onUpdateWipLimit && (
        <WipLimitSettings
          currentLimit={wipLimit}
          onSave={(limit) => {
            onUpdateWipLimit(column.id, limit)
            setShowWipSettings(false)
          }}
          onClose={() => setShowWipSettings(false)}
        />
      )}

      {/* Droppable area */}
      <Droppable droppableId={column.id} type="ISSUE">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 flex flex-col gap-2 p-2 rounded-xl min-h-[200px] transition-colors',
              snapshot.isDraggingOver && !isAtLimit
                ? 'bg-blue-50 border-2 border-dashed border-blue-300'
                : snapshot.isDraggingOver && isAtLimit
                  ? 'bg-red-50 border-2 border-dashed border-red-300'
                  : isOverLimit
                    ? 'bg-red-50/30'
                    : 'bg-gray-100/50',
            )}
          >
            {column.issues.map((issue, index) => (
              <BoardCard key={issue.id} issue={issue} index={index} />
            ))}
            {provided.placeholder}
            {column.issues.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-20 text-xs text-gray-500">
                {t('issues.noIssuesBoard')}
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}
