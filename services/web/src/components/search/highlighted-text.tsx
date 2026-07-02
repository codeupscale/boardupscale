/**
 * Safely renders Elasticsearch highlight snippets that may contain <mark> tags.
 */
export function HighlightedText({ html }: { html: string }) {
  const parts = html.split(/(<mark>|<\/mark>)/)
  let inside = false
  const elements: React.ReactNode[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === '<mark>') {
      inside = true
      continue
    }
    if (part === '</mark>') {
      inside = false
      continue
    }
    if (inside) {
      elements.push(
        <mark
          key={i}
          className="bg-yellow-200/80 dark:bg-yellow-700/40 text-yellow-900 dark:text-yellow-200 rounded-sm px-0.5"
        >
          {part}
        </mark>,
      )
    } else {
      elements.push(part)
    }
  }

  return <>{elements}</>
}
