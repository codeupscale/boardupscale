import { useNavigate } from 'react-router-dom'
import { Issue } from '@/types'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { IssueTypeIcon } from './issue-type-icon'
import { PriorityBadge } from './priority-badge'

interface IssueCardProps {
  issue: Issue
  className?: string
}

export function IssueCard({ issue, className }: IssueCardProps) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/issues/${issue.id}`)}
      className={cn(
        'bg-card rounded-lg border border-border p-3 shadow-sm hover:shadow-md hover:border-border cursor-pointer transition-all group',
        className,
      )}
    >
      {/* Issue key + type */}
      <div className="flex items-center gap-1.5 mb-2">
        <IssueTypeIcon type={issue.type} />
        <span className="text-xs font-mono text-primary font-medium">{issue.key}</span>
      </div>

      {/* Title */}
      <p className="text-sm text-foreground font-medium leading-snug line-clamp-2 mb-3 group-hover:text-primary transition-colors">
        {issue.title}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <PriorityBadge priority={issue.priority} showLabel={false} />
        <div className="flex items-center gap-2 ml-auto">
          {issue.storyPoints != null && (
            <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {issue.storyPoints}
            </span>
          )}
          {issue.assignee ? (
            <Avatar user={issue.assignee} size="xs" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-muted border-2 border-dashed border-border" />
          )}
        </div>
      </div>
    </div>
  )
}
