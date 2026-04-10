import { cn } from '@/lib/utils'

interface RichTextDisplayProps {
  content: string
  className?: string
}

/**
 * Renders stored HTML rich text content.
 * File URLs (/api/files/:id/view) are public and permanent — no token needed.
 */
export function RichTextDisplay({ content, className }: RichTextDisplayProps) {
  if (!content || content === '<p></p>') return null

  return (
    <div
      className={cn('rich-text-content text-gray-700 dark:text-gray-300', className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
