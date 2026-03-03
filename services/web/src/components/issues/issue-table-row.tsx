import { useNavigate } from 'react-router-dom'
import { Issue } from '@/types'
import { cn, formatDate } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { IssueTypeIcon } from './issue-type-icon'
import { PriorityBadge } from './priority-badge'
import { StatusBadge } from './status-badge'

interface IssueTableRowProps {
  issue: Issue
  className?: string
}

export function IssueTableRow({ issue, className }: IssueTableRowProps) {
  const navigate = useNavigate()

  return (
    <tr
      onClick={() => navigate(`/issues/${issue.id}`)}
      className={cn(
        'hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-0',
        className,
      )}
    >
      {/* Type + Key */}
      <td className="px-4 py-3 w-32">
        <div className="flex items-center gap-1.5">
          <IssueTypeIcon type={issue.type} />
          <span className="text-xs font-mono text-blue-600 font-medium">{issue.key}</span>
        </div>
      </td>

      {/* Title */}
      <td className="px-4 py-3">
        <span className="text-sm text-gray-900 font-medium line-clamp-1">{issue.title}</span>
      </td>

      {/* Priority */}
      <td className="px-4 py-3 w-28">
        <PriorityBadge priority={issue.priority} />
      </td>

      {/* Status */}
      <td className="px-4 py-3 w-36">
        <StatusBadge status={issue.status} />
      </td>

      {/* Assignee */}
      <td className="px-4 py-3 w-16">
        {issue.assignee ? (
          <Avatar user={issue.assignee} size="xs" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-gray-100 border border-dashed border-gray-300" />
        )}
      </td>

      {/* Due Date */}
      <td className="px-4 py-3 w-28">
        {issue.dueDate ? (
          <span className="text-xs text-gray-500">{formatDate(issue.dueDate)}</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Story Points */}
      <td className="px-4 py-3 w-16 text-center">
        {issue.storyPoints != null ? (
          <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
            {issue.storyPoints}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
    </tr>
  )
}
