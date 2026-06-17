import { cn } from '@/lib/utils'
import { formatStoryPoints, hasStoryPoints, resolveIssueSprintName } from '@/lib/issue-display'
import type { Issue, Sprint } from '@/types'

export type IssueMetadataBadgeVariant = 'board' | 'compact'

const VARIANT_STYLES = {
  board: {
    sprint:
      'text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full max-w-[120px] truncate',
    storyPoints:
      'text-[10px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full',
  },
  compact: {
    sprint: 'text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 max-w-[140px] truncate',
    storyPoints: 'text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5',
  },
} as const

interface IssueMetadataBadgesProps {
  issue: Pick<Issue, 'storyPoints' | 'sprint' | 'sprintId'>
  variant?: IssueMetadataBadgeVariant
  /** Fallback when API payload only includes sprintId (optimistic updates). */
  sprintLookup?: ReadonlyArray<Pick<Sprint, 'id' | 'name' | 'status'>>
  className?: string
  showStoryPoints?: boolean
}

export function IssueMetadataBadges({
  issue,
  variant = 'board',
  sprintLookup,
  className,
  showStoryPoints = true,
}: IssueMetadataBadgesProps) {
  const sprintName = resolveIssueSprintName(issue, sprintLookup)
  const showSp = showStoryPoints && hasStoryPoints(issue.storyPoints)

  if (!sprintName && !showSp) return null

  const styles = VARIANT_STYLES[variant]

  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', className)}>
      {sprintName && (
        <span className={styles.sprint} title={sprintName}>
          {sprintName}
        </span>
      )}
      {showSp && issue.storyPoints != null && (
        <span className={styles.storyPoints}>
          {formatStoryPoints(issue.storyPoints)} SP
        </span>
      )}
    </div>
  )
}
