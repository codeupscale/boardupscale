import { IssuePriority } from '@/types'

/** Ordered priority values for select/dropdown UIs */
export const ISSUE_PRIORITY_SELECT_OPTIONS = [
  IssuePriority.CRITICAL,
  IssuePriority.HIGH,
  IssuePriority.MEDIUM,
  IssuePriority.LOW,
  IssuePriority.NONE,
] as const
