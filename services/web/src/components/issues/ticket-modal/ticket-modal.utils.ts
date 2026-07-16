import { Issue, IssuePriority, IssueStatus, IssueStatusCategory, MediaThumbnailItem } from '@/types'
import { extractFileIdsFromText, parseFileIdFromViewUrl } from '@/lib/uploadFile'
import type { IssueTicketFormValues } from './issue-ticket-form.schema'
import { cn } from '@/lib/utils'
import { ticketModalTokens } from './ticket-modal.tokens'
import type { TicketStatusOption } from './ticket-modal.types'

/** Shared control styling for ticket modal inputs (matches Work Type select) */
export function ticketModalFieldControl(...extra: Array<string | undefined>) {
  return cn(
    ticketModalTokens.fieldSurface,
    ticketModalTokens.fieldHeight,
    ticketModalTokens.fieldFocus,
    ticketModalTokens.fieldDisabled,
    ...extra,
  )
}

export function mapTicketStatuses(
  statuses: Array<Pick<IssueStatus, 'id' | 'name' | 'color' | 'category'>> | undefined,
): TicketStatusOption[] {
  if (!statuses?.length) return []
  return statuses.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
  }))
}

export function getDefaultTodoStatusId(
  statuses: TicketStatusOption[] | undefined,
): string | undefined {
  if (!statuses?.length) return undefined
  return statuses.find((s) => s.category === IssueStatusCategory.TODO)?.id
}

/**
 * Merge create-dialog defaults. Page overrides may only replace a key when the
 * value is a non-empty string — never wipe TODO with `{ statusId: undefined }`.
 */
export function resolveCreateTicketDefaults(
  statuses: TicketStatusOption[] | undefined,
  pageDefaults?: Partial<IssueTicketFormValues>,
): Partial<IssueTicketFormValues> {
  const definedPageDefaults = Object.fromEntries(
    Object.entries(pageDefaults ?? {}).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    ),
  ) as Partial<IssueTicketFormValues>

  const todoStatusId = getDefaultTodoStatusId(statuses)

  return {
    ...(todoStatusId ? { statusId: todoStatusId } : {}),
    ...definedPageDefaults,
  }
}

/** True when HTML has text or media (img/video), so image-only comments are valid. */
export function hasRichTextContent(html: string | null | undefined): boolean {
  if (!html || typeof html !== 'string') return false
  const trimmed = html.trim()
  if (!trimmed) return false
  if (/<(img|video|iframe)\b/i.test(trimmed)) return true
  const text = trimmed
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0
}

/** Extract attachment UUIDs from `/files/:id/view` URLs in HTML. */
export function extractAttachmentIdsFromHtml(html: string | null | undefined): string[] {
  return extractFileIdsFromText(html)
}

function readHtmlAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))
  return match?.[1]
}

/** Extract image/video attachments embedded in saved rich-text HTML. */
export function extractMediaFromHtml(html: string | null | undefined): MediaThumbnailItem[] {
  if (!html) return []

  const items: MediaThumbnailItem[] = []
  const seen = new Set<string>()

  const push = (
    id: string,
    url: string,
    fileName: string | undefined,
    type: 'image' | 'video',
  ) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    items.push({ id, url, fileName, type })
  }

  const imgTagRe = /<img\b[^>]*>/gi
  let imgMatch: RegExpExecArray | null
  while ((imgMatch = imgTagRe.exec(html)) !== null) {
    const tag = imgMatch[0]
    const src = readHtmlAttribute(tag, 'src')
    if (!src) continue
    const id = parseFileIdFromViewUrl(src)
    if (!id) continue
    const alt = readHtmlAttribute(tag, 'alt')
    const title = readHtmlAttribute(tag, 'title')
    push(id, src, alt || title || undefined, 'image')
  }

  const videoTagRe = /<video\b[^>]*>[\s\S]*?<\/video>/gi
  let videoMatch: RegExpExecArray | null
  while ((videoMatch = videoTagRe.exec(html)) !== null) {
    const tag = videoMatch[0]
    const src =
      readHtmlAttribute(tag, 'src') ||
      tag.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
    if (!src) continue
    const id = parseFileIdFromViewUrl(src)
    if (!id) continue
    push(id, src, readHtmlAttribute(tag, 'title') || undefined, 'video')
  }

  return items
}

/** Remove inline img/video nodes so thumbnails can be shown separately. */
export function stripInlineMediaFromHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<video\b[\s\S]*?<\/video>/gi, '')
    .replace(/<p>(?:\s|&nbsp;)*<\/p>/gi, '')
    .trim()
}

/** Remove img/video nodes whose src references the given attachment id. */
export function stripAttachmentFromHtml(
  html: string | null | undefined,
  attachmentId: string,
): string {
  if (!html || !attachmentId) return html ?? ''
  const escaped = attachmentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<(img|video)\\b[^>]*\\/files\\/${escaped}\\/view[^>]*>`,
    'gi',
  )
  return html.replace(re, '')
}

export function issueToTicketFormValues(issue: Issue): Partial<IssueTicketFormValues> {
  return {
    title: issue.title,
    description: issue.description ?? '',
    type: issue.type,
    priority: issue.priority as IssuePriority,
    statusId: issue.statusId ?? '',
    assigneeId: issue.assigneeId ?? '',
    parentId: issue.parentId ?? '',
    sprintId: issue.sprintId ?? '',
    dueDate: issue.dueDate ?? '',
  }
}
