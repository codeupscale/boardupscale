import { IssueType } from '@/types'

/** Max attachment size for ticket modal uploads (matches API limit) */
export const TICKET_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024

/** Shared media viewer / thumbnail UI tokens */
export const MEDIA_LIGHTBOX_SELECTOR = '[data-media-lightbox]' as const
export const MEDIA_LIGHTBOX_OPEN_ATTR = 'data-media-lightbox-open' as const
export const MEDIA_LIGHTBOX_Z_INDEX = 200
export const MEDIA_THUMBNAIL_WIDTH_CLASS = 'w-[104px]' as const

/** Issue types available in top-level create ticket flow (no subtasks) */
export const TOP_LEVEL_ISSUE_TYPES = [
  IssueType.EPIC,
  IssueType.STORY,
  IssueType.TASK,
  IssueType.BUG,
] as const
