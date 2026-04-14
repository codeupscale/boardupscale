import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Droppable } from '@hello-pangea/dnd'
import { useTranslation } from 'react-i18next'
import { BoardColumn as BoardColumnType, Issue, SwimlaneGroupBy } from '@/types'
import { cn } from '@/lib/utils'
import { BoardCard } from './board-card'

interface SwimlaneGroup {
  key: string
  label: string
  issues: Issue[]
  avatarUrl?: string
}

interface BoardSwimlaneProps {
  group: SwimlaneGroup
  columns: BoardColumnType[]
  onAddIssue?: (statusId: string) => void
  isWipExceeded: (columnId: string, extraCount?: number) => boolean
}

export function BoardSwimlane({ group, columns, onAddIssue, isWipExceeded }: BoardSwimlaneProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)

  const issueCount = group.issues.length

  return (
    <div className="mb-4">
      {/* Swimlane Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-4 py-2.5 w-full text-left bg-muted/50 border-y border-border hover:bg-muted transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        {group.avatarUrl ? (
          <img
            src={group.avatarUrl}
            alt={group.label}
            className="h-5 w-5 rounded-full flex-shrink-0"
          />
        ) : (
          <span className="h-5 w-5 rounded-full bg-muted-foreground/60 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
            {group.label[0]?.toUpperCase() || '?'}
          </span>
        )}
        <span className="text-sm font-semibold text-foreground/80">{group.label}</span>
        <span className="text-xs text-muted-foreground font-medium bg-muted rounded-full px-1.5 py-0.5">
          {issueCount}
        </span>
      </button>

      {/* Swimlane Columns */}
      {expanded && (
        <div className="flex gap-4 px-6 py-4 overflow-x-auto">
          {columns.map((column) => {
            const columnIssues = group.issues.filter((issue) => issue.statusId === column.id)
            const droppableId = `${column.id}::${group.key}`
            const exceeded = isWipExceeded(column.id)

            return (
              <div key={column.id} className="flex flex-col w-72 flex-shrink-0">
                <Droppable droppableId={droppableId} type="ISSUE">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'flex-1 flex flex-col gap-2 p-2 rounded-xl min-h-[80px] transition-colors',
                        snapshot.isDraggingOver && !exceeded
                          ? 'bg-primary/10 border-2 border-dashed border-primary/50'
                          : snapshot.isDraggingOver && exceeded
                            ? 'bg-red-50 border-2 border-dashed border-red-300'
                            : 'bg-muted/50',
                      )}
                    >
                      {columnIssues.map((issue, index) => (
                        <BoardCard key={issue.id} issue={issue} index={index} />
                      ))}
                      {provided.placeholder}
                      {columnIssues.length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex items-center justify-center h-12 text-xs text-muted-foreground">
                          {t('issues.noIssuesBoard', 'No issues')}
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Group issues by a chosen field, returning SwimlaneGroup[] */
export function groupIssuesBySwimlane(
  issues: Issue[],
  groupBy: SwimlaneGroupBy,
): SwimlaneGroup[] {
  if (groupBy === 'none') return []

  const groups = new Map<string, SwimlaneGroup>()

  for (const issue of issues) {
    let key: string
    let label: string
    let avatarUrl: string | undefined

    switch (groupBy) {
      case 'assignee':
        key = issue.assigneeId || '__unassigned__'
        label = issue.assignee?.displayName || 'Unassigned'
        avatarUrl = issue.assignee?.avatarUrl
        break
      case 'priority':
        key = issue.priority || 'none'
        label = priorityLabel(key)
        break
      case 'type':
        key = issue.type || 'task'
        label = key.charAt(0).toUpperCase() + key.slice(1)
        break
      case 'epic':
        key = issue.parentId || '__no_epic__'
        label = issue.parent?.title || (issue.parentId ? `Epic ${issue.parentId.slice(0, 8)}` : 'No Epic')
        break
      default:
        key = '__all__'
        label = 'All'
    }

    if (!groups.has(key)) {
      groups.set(key, { key, label, issues: [], avatarUrl })
    }
    groups.get(key)!.issues.push(issue)
  }

  // Sort groups by a logical order
  const result = Array.from(groups.values())

  if (groupBy === 'priority') {
    const order = ['critical', 'high', 'medium', 'low', 'none']
    result.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  } else if (groupBy === 'type') {
    const order = ['epic', 'story', 'task', 'bug', 'subtask']
    result.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  } else {
    // Sort unassigned / no epic to the bottom
    result.sort((a, b) => {
      if (a.key.startsWith('__')) return 1
      if (b.key.startsWith('__')) return -1
      return a.label.localeCompare(b.label)
    })
  }

  return result
}

function priorityLabel(key: string): string {
  const map: Record<string, string> = {
    critical: 'P0 Critical',
    high: 'P1 High',
    medium: 'P2 Medium',
    low: 'P3 Low',
    none: 'No Priority',
  }
  return map[key] || key
}
