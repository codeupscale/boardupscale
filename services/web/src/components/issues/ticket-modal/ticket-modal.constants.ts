import { IssueType } from '@/types'

/** Max attachment size for ticket modal uploads (matches API limit) */
export const TICKET_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024

/** Issue types available in top-level create ticket flow (no subtasks) */
export const TOP_LEVEL_ISSUE_TYPES = [
  IssueType.EPIC,
  IssueType.STORY,
  IssueType.TASK,
  IssueType.BUG,
] as const
