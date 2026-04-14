import { useNavigate } from 'react-router-dom'
import { Issue } from '@/types'
import { cn, formatDate } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { IssueTypeIcon } from './issue-type-icon'
import { PriorityBadge } from './priority-badge'
import { StatusBadge } from './status-badge'
import { useSelectionStore } from '@/store/selection.store'

interface IssueTableRowProps {
  issue: Issue
  className?: string
  selectable?: boolean
  showDeletedAt?: boolean
  showProject?: boolean
}

export function IssueTableRow({ issue, className, selectable = false, showDeletedAt = false, showProject = false }: IssueTableRowProps) {
  const navigate = useNavigate()
  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const toggleIssue = useSelectionStore((s) => s.toggleIssue)
  const isSelected = selectedIssueIds.has(issue.id)

  return (
    <tr
      onClick={() => {
        if (!selectable) {
          navigate(`/issues/${issue.id}`)
        }
      }}
      className={cn(
        'cursor-pointer transition-colors border-b border-border last:border-0',
        'hover:bg-primary/5',
        selectable && isSelected && 'bg-primary/10 hover:bg-primary/10',
        className,
      )}
    >
      {/* Checkbox */}
      {selectable && (
        <td className="px-4 py-3 w-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation()
              toggleIssue(issue.id)
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
          />
        </td>
      )}

      {/* Type + Key */}
      <td
        className="px-4 py-3 w-32"
        onClick={() => navigate(`/issues/${issue.id}`)}
      >
        <div className="flex items-center gap-1.5">
          <IssueTypeIcon type={issue.type} />
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
            {issue.key}
          </span>
        </div>
      </td>

      {/* Project name — shown only in multi-project contexts */}
      {showProject && (
        <td
          className="px-4 py-3 w-40"
          onClick={() => navigate(`/issues/${issue.id}`)}
        >
          {issue.project ? (
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded truncate block max-w-[140px]" title={issue.project.name}>
              {issue.project.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">--</span>
          )}
        </td>
      )}

      {/* Title */}
      <td
        className="px-4 py-3"
        onClick={() => navigate(`/issues/${issue.id}`)}
      >
        <span className="text-sm text-foreground font-medium line-clamp-1">{issue.title}</span>
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
          <div className="h-6 w-6 rounded-full bg-muted border border-dashed border-border" />
        )}
      </td>

      {/* Due Date or Deleted At */}
      <td className="px-4 py-3 w-28">
        {showDeletedAt ? (
          issue.deletedAt ? (
            <span className="text-xs text-red-500">{formatDate(issue.deletedAt)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">--</span>
          )
        ) : issue.dueDate ? (
          <span className="text-xs text-muted-foreground">{formatDate(issue.dueDate)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </td>

      {/* Story Points */}
      <td className="px-4 py-3 w-16 text-center">
        {issue.storyPoints != null ? (
          <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {issue.storyPoints}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </td>
    </tr>
  )
}
