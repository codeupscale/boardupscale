import { Link } from 'react-router-dom'
import { ListTree } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Issue } from '@/types'
import { Tooltip } from '@/components/ui/tooltip'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { StatusBadge } from '@/components/issues/status-badge'
import { useIssueChildren } from '@/hooks/useIssues'
import { CopyTicketLink } from '@/components/common/copy-ticket-link'

const INDICATOR_CLASS =
  'inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20 transition-colors cursor-default'

function IssueChildrenTooltipContent({
  issueId,
  childrenCount,
}: {
  issueId: string
  childrenCount: number
}) {
  const { t } = useTranslation()
  const { data: children, isLoading, isError, error } = useIssueChildren(issueId)

  return (
    <div className="flex flex-col w-[300px] max-w-[min(300px,calc(100vw-2rem))]" onClick={(e) => e.stopPropagation()}>
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('issues.childIssues', 'Child Issues')}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {childrenCount} {childrenCount === 1 ? 'issue' : 'issues'}
        </p>
      </div>
      <div className="max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {isLoading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>
        ) : isError ? (
          <p className="px-3 py-4 text-sm text-destructive">
            {(error as any)?.response?.data?.message ||
              (error as Error)?.message ||
              t('issues.childrenLoadFailed', 'Failed to load child issues.')}
          </p>
        ) : !children?.length ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {t('issues.noChildIssues', 'No child issues yet.')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {children.map((child: Issue) => (
              <li key={child.id}>
                <Link
                  to={`/issues/${child.id}`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <IssueTypeIcon type={child.type} className="h-3.5 w-3.5 shrink-0" />
                  <CopyTicketLink
                    issueKey={child.key}
                    issueId={child.id}
                    issueType={child.type}
                    className="text-[10px] shrink-0"
                  />
                  <span className="text-xs text-foreground truncate flex-1">{child.title}</span>
                  {child.status && <StatusBadge status={child.status} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function IssueChildrenIndicator({
  issueId,
  childrenCount,
}: {
  issueId: string
  childrenCount?: number
}) {
  if (!childrenCount || childrenCount <= 0) return null

  return (
    <Tooltip
      content={<IssueChildrenTooltipContent issueId={issueId} childrenCount={childrenCount} />}
      side="bottom"
      align="start"
      sideOffset={6}
      stopPropagation
      className="rounded-lg border shadow-lg p-0"
    >
      <span
        className={INDICATOR_CLASS}
        onClick={(e) => e.stopPropagation()}
        role="img"
        aria-label={`${childrenCount} child issues`}
      >
        <ListTree className="h-3 w-3 shrink-0" />
        <span className="truncate">{childrenCount}</span>
      </span>
    </Tooltip>
  )
}
