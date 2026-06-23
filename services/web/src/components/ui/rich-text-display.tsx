import { cn } from '@/lib/utils'

/** Total editor chrome cap (toolbar + content) on issue detail surfaces. */
export const RICH_TEXT_ISSUE_EDITOR_MAX_HEIGHT = 'min(280px, 30vh)' as const

/** Content-only scroll cap — matches the editor's inner text area (toolbar subtracted). */
export const RICH_TEXT_ISSUE_CONTENT_MAX_HEIGHT =
  'calc(min(280px, 30vh) - 2.625rem)' as const

export const RICH_TEXT_ISSUE_CONTENT_MIN_HEIGHT = 80

interface RichTextDisplayProps {
  content: string
  className?: string
  /**
   * When set, long saved HTML scrolls inside this cap instead of expanding
   * the page layout (issue description view, comments, etc.).
   */
  maxHeight?: number | string
}

/**
 * Renders stored HTML rich text content.
 * File URLs (/api/files/:id/view) are public and permanent — no token needed.
 */
export function RichTextDisplay({ content, className, maxHeight }: RichTextDisplayProps) {
  if (!content || content === '<p></p>') return null

  const resolvedMaxHeight =
    maxHeight != null
      ? typeof maxHeight === 'number'
        ? `${maxHeight}px`
        : maxHeight
      : undefined

  return (
    <div
      className={cn('rich-text-content', resolvedMaxHeight && 'overflow-y-auto', className)}
      style={resolvedMaxHeight ? { maxHeight: resolvedMaxHeight } : undefined}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
