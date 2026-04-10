import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface RichTextDisplayProps {
  content: string
  className?: string
}

/**
 * Renders stored HTML rich text content safely.
 * Rewrites /files/:id/view URLs to include the current access token
 * so images and embeds load correctly even after the original token expired.
 */
export function RichTextDisplay({ content, className }: RichTextDisplayProps) {
  const processedContent = useMemo(() => {
    if (!content || content === '<p></p>') return ''

    const token = localStorage.getItem('accessToken') || ''
    if (!token) return content

    // Rewrite any /files/UUID/view URL to include current token
    return content.replace(
      /(\/(?:api\/)?files\/[0-9a-f-]{36}\/view)(\?token=[^"&\s]*)?/gi,
      (_, path) => `${path}?token=${encodeURIComponent(token)}`,
    )
  }, [content])

  if (!processedContent) return null

  return (
    <div
      className={cn('rich-text-content text-gray-700 dark:text-gray-300', className)}
      dangerouslySetInnerHTML={{ __html: processedContent }}
    />
  )
}
