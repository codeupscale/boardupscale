import { useState, useRef } from 'react'
import { Droppable, DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import {
  Plus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Gauge,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useScrollPagination } from '@/hooks/useScrollPagination'
import { useTranslation } from 'react-i18next'
import { BoardColumn as BoardColumnType, Issue } from '@/types'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { BoardCard } from './board-card'
import { WipLimitSettings } from './wip-limit-settings'

interface BoardColumnProps {
  column: BoardColumnType
  /** Extra issues appended via load-more (not yet in column.issues) */
  extraIssues?: Issue[]
  dragHandleProps?: DraggableProvidedDragHandleProps | null
  onAddIssue?: (statusId: string) => void
  onUpdateWipLimit?: (statusId: string, wipLimit: number) => void
  onEditColumn?: (statusId: string) => void
  onDeleteColumn?: (statusId: string) => void
  onLoadMore?: (statusId: string) => void
  isLoadingMore?: boolean
}

export function BoardColumn({
  column,
  extraIssues = [],
  dragHandleProps,
  onAddIssue,
  onUpdateWipLimit,
  onEditColumn,
  onDeleteColumn,
  onLoadMore,
  isLoadingMore,
}: BoardColumnProps) {
  const { t } = useTranslation()
  const [showWipSettings, setShowWipSettings] = useState(false)

  // Ref to the Droppable scroll container — used as IntersectionObserver root
  // so rootMargin is measured relative to the column bounds, not the viewport.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const displayedIssues = [...column.issues, ...extraIssues]
  const issueCount = displayedIssues.length
  const totalCount = column.total ?? column.issues.length
  const wipLimit = column.wipLimit || 0
  const isAtLimit = wipLimit > 0 && issueCount >= wipLimit
  const isOverLimit = wipLimit > 0 && issueCount > wipLimit
  const wipPercent = wipLimit > 0 ? Math.min(100, (issueCount / wipLimit) * 100) : 0

  const remainingCount = totalCount - issueCount
  const showLoadMore = (column.hasMore ?? false) && remainingCount > 0

  const sentinelRef = useScrollPagination(
    showLoadMore,
    !!isLoadingMore,
    () => onLoadMore?.(column.id),
    scrollContainerRef,
  )

  return (
    <div className="flex flex-col h-full min-h-0 w-[280px] flex-shrink-0 bg-gray-50/80 dark:bg-gray-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden">
      {/* Colored top accent bar */}
      <div
        className="h-1 flex-shrink-0"
        style={{ backgroundColor: column.color ?? '#6b7280' }}
      />

      {/* Column Header */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2.5 flex-shrink-0',
          'bg-card/80 backdrop-blur-sm border-b border-border',
          isOverLimit && 'border-b-red-200 dark:border-b-red-800',
          isAtLimit && !isOverLimit && 'border-b-amber-200 dark:border-b-amber-800',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color ?? '#6b7280' }}
          />
          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
            {column.name}
          </span>
          <span
            className={cn(
              'text-xs font-medium rounded-full px-1.5 py-0.5 flex-shrink-0 tabular-nums',
              isOverLimit
                ? 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/40'
                : isAtLimit
                  ? 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/40'
                  : 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800',
            )}
          >
            {wipLimit > 0 ? `${issueCount}/${wipLimit}` : totalCount > issueCount ? `${issueCount} / ${totalCount}` : issueCount}
          </span>
          {isOverLimit && (
            <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                title={t('board.columnSettings', 'Column settings')}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEditColumn && (
                <DropdownMenuItem onClick={() => onEditColumn(column.id)}>
                  <Pencil className="h-4 w-4" />
                  Edit column
                </DropdownMenuItem>
              )}
              {onUpdateWipLimit && (
                <DropdownMenuItem onClick={() => setShowWipSettings(true)}>
                  <Gauge className="h-4 w-4" />
                  WIP limit{wipLimit > 0 ? ` (${wipLimit})` : ''}
                </DropdownMenuItem>
              )}
              {onDeleteColumn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={() => onDeleteColumn(column.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete column
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {onAddIssue && (
            <button
              onClick={() => onAddIssue(column.id)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
              title={t('issues.addIssue')}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* WIP Limit Progress Bar */}
      {wipLimit > 0 && (
        <div className="px-3 py-2 bg-card/60 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
            <span className="font-medium">WIP</span>
            <span className={cn('font-semibold', isOverLimit && 'text-red-500')}>
              {issueCount}/{wipLimit}
            </span>
          </div>
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                isOverLimit ? 'bg-red-500' : isAtLimit ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${wipPercent}%` }}
            />
          </div>
        </div>
      )}

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
        {(provided, snapshot) => {
          // Merge DnD ref with our scroll-container ref
          const mergedRef = (el: HTMLDivElement | null) => {
            provided.innerRef(el)
            scrollContainerRef.current = el
          }

          return (
            <div
              ref={mergedRef}
              {...provided.droppableProps}
              className={cn(
                'flex-1 flex flex-col gap-2 px-2 py-2 min-h-[180px] overflow-y-auto',
                'scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent',
                snapshot.isDraggingOver && !isAtLimit
                  ? 'bg-primary/10'
                  : snapshot.isDraggingOver && isAtLimit
                    ? 'bg-red-50/60 dark:bg-red-950/30'
                    : '',
              )}
            >
              {displayedIssues.map((issue, index) => (
                <BoardCard key={issue.id} issue={issue} index={index} />
              ))}
              {provided.placeholder}

              {/* Empty state */}
              {displayedIssues.length === 0 && !snapshot.isDraggingOver && (
                <div className="flex flex-col items-center justify-center flex-1 py-8 gap-2">
                  <div
                    className="w-8 h-8 rounded-full opacity-20 flex-shrink-0"
                    style={{ backgroundColor: column.color ?? '#6b7280' }}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
                    {t('issues.noIssuesBoard')}
                  </p>
                </div>
              )}

              {/* Invisible scroll sentinel — triggers load when scrolled into view */}
              {showLoadMore && (
                <div ref={sentinelRef} className="h-px w-full flex-shrink-0" aria-hidden="true" />
              )}

              {/* Loading indicator while fetching next page */}
              {isLoadingMore && (
                <div className="flex items-center justify-center py-3 flex-shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-600" />
                </div>
              )}
            </div>
          )
        }}
      </Droppable>
    </div>
  )
}
