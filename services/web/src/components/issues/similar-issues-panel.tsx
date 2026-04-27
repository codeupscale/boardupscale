import { Link } from 'react-router-dom'
import { AlertTriangle, ExternalLink, Sparkles } from 'lucide-react'
import { useSimilarIssues, SearchResultItem } from '@/hooks/useSearch'
import { IssueTypeIcon } from './issue-type-icon'
import { IssueType } from '@/types'
import { cn } from '@/lib/utils'
import { CopyTicketLink } from '@/components/common/copy-ticket-link'

interface SimilarIssuesPanelProps {
  title: string
  projectId?: string
  excludeIssueId?: string
  className?: string
}

export function SimilarIssuesPanel({
  title,
  projectId,
  excludeIssueId,
  className,
}: SimilarIssuesPanelProps) {
  const { data, isLoading } = useSimilarIssues(title, projectId, excludeIssueId)

  const items = data?.items || []

  if (isLoading && title.length >= 8) {
    return (
      <div className={cn('rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3', className)}>
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          <span>Checking for similar issues...</span>
        </div>
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className={cn('rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          Possible duplicates found ({items.length})
        </span>
        <span className="text-xs text-amber-500 dark:text-amber-500">
          via {data?.source === 'elasticsearch' ? 'ES' : 'PG'}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <SimilarIssueItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

function SimilarIssueItem({ item }: { item: SearchResultItem }) {
  return (
    <Link
      to={`/issues/${item.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-card border border-amber-100 dark:border-amber-800/50 hover:border-amber-300 dark:hover:border-amber-600 transition-colors group"
    >
      <IssueTypeIcon type={item.type as IssueType} />
      <CopyTicketLink issueKey={item.key} issueId={item.id} className="text-xs font-mono text-primary font-medium flex-shrink-0" />
      <span className="text-xs text-foreground truncate flex-1">
        {item.title}
      </span>
      {item.statusName && (
        <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded flex-shrink-0">
          {item.statusName}
        </span>
      )}
      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </Link>
  )
}
