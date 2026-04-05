import { useNavigate } from 'react-router-dom'
import { Draggable } from '@hello-pangea/dnd'
import { Issue, IssuePriority } from '@/types'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { PriorityBadge } from '@/components/issues/priority-badge'

interface BoardCardProps {
  issue: Issue
  index: number
}

const priorityBorderClass: Record<IssuePriority, string> = {
  [IssuePriority.CRITICAL]: 'border-l-[3px] border-l-red-500',
  [IssuePriority.HIGH]: 'border-l-[3px] border-l-orange-400',
  [IssuePriority.MEDIUM]: 'border-l-[3px] border-l-yellow-400',
  [IssuePriority.LOW]: 'border-l-[3px] border-l-blue-400',
  [IssuePriority.NONE]: 'border-l-[3px] border-l-gray-200 dark:border-l-gray-700',
}

export function BoardCard({ issue, index }: BoardCardProps) {
  const navigate = useNavigate()
  const borderClass = priorityBorderClass[issue.priority] ?? priorityBorderClass[IssuePriority.NONE]
  const labels = issue.labels ?? []

  return (
    <Draggable draggableId={issue.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => navigate(`/issues/${issue.id}`)}
          className={cn(
            'group relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-700/80',
            'shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer',
            'hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-600',
            borderClass,
            snapshot.isDragging && 'opacity-90 rotate-1 shadow-lg',
          )}
        >
          <div className="p-3">
            {/* Top row: key + type icon */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500 tracking-wide">
                {issue.key}
              </span>
              <IssueTypeIcon type={issue.type} className="h-3.5 w-3.5 flex-shrink-0" />
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 mb-3 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {issue.title}
            </p>

            {/* Labels */}
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2.5">
                {labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium"
                  >
                    {label}
                  </span>
                ))}
                {labels.length > 2 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                    +{labels.length - 2}
                  </span>
                )}
              </div>
            )}

            {/* Bottom row: priority + story points + assignee */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <PriorityBadge priority={issue.priority} showLabel={false} />
                {issue.storyPoints != null && (
                  <span className="text-[10px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                    {issue.storyPoints}
                  </span>
                )}
              </div>
              {issue.assignee ? (
                <Avatar user={issue.assignee} size="xs" />
              ) : (
                <div className="w-5 h-5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex-shrink-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}
