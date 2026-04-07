import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '@/store/ui.store'
import { useSearch, SearchResultItem, SearchHighlight } from '@/hooks/useSearch'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { IssueType } from '@/types'
import { cn } from '@/lib/utils'

/** Map ES field names to human-readable labels */
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  assigneeName: 'Assignee',
  labels: 'Labels',
}

/**
 * Render an HTML string with <mark> tags safely as React elements.
 * Only allows <mark> and </mark> tags; all other HTML is escaped.
 */
function HighlightedText({ html }: { html: string }) {
  // Split on <mark> and </mark> to produce safe segments
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
        <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
          {part}
        </mark>
      )
    } else {
      elements.push(part)
    }
  }

  return <>{elements}</>
}

function SearchResultHighlights({ highlights }: { highlights: SearchHighlight[] }) {
  if (!highlights || highlights.length === 0) return null

  // Show at most 2 highlights
  const shown = highlights.slice(0, 2)

  return (
    <div className="mt-1 space-y-0.5">
      {shown.map((hl) => (
        <div key={hl.field} className="flex items-start gap-1.5 text-xs">
          <span className="text-gray-400 flex-shrink-0 font-medium">
            {FIELD_LABELS[hl.field] || hl.field}:
          </span>
          <span className="text-gray-600 line-clamp-1">
            <HighlightedText html={hl.snippets[0]} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function SearchModal() {
  const { t } = useTranslation()
  const { isSearchOpen, setSearchOpen } = useUiStore()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { data, isLoading } = useSearch(query)

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setSearchOpen])

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setActiveIndex(-1)
    }
  }, [isSearchOpen])

  if (!isSearchOpen) return null

  const items: SearchResultItem[] = data?.items || []
  const searchSource = data?.source

  const handleSelect = (item: SearchResultItem) => {
    navigate(`/issues/${item.id}`)
    setSearchOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < items.length) {
      e.preventDefault()
      handleSelect(items[activeIndex])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="Search issues"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setSearchOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            aria-activedescendant={activeIndex >= 0 && items[activeIndex] ? `search-option-${items[activeIndex].id}` : undefined}
            aria-controls="search-results-listbox"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded={items.length > 0}
            className="flex-1 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="text-xs text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading && query.length >= 2 && (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              {t('search.searching')}
            </div>
          )}

          {!isLoading && query.length >= 2 && items.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-500">
              {t('search.noResultsFor', { query })}
            </div>
          )}

          {items.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('search.issues')}
                </span>
                {searchSource === 'elasticsearch' && (
                  <span className="text-[10px] text-gray-300 font-mono">ES</span>
                )}
              </div>
              <div id="search-results-listbox" role="listbox" aria-label="Search results">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    id={`search-option-${item.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      'w-full flex flex-col px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left',
                      index === activeIndex && 'bg-blue-50 dark:bg-blue-900/30',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <IssueTypeIcon type={item.type as IssueType} className="h-4 w-4 flex-shrink-0" />
                      <span className="text-xs font-mono text-blue-600 flex-shrink-0">{item.key}</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{item.title}</span>
                      {item.projectName && (
                        <span className="ml-auto text-[10px] text-gray-500 flex-shrink-0">
                          {item.projectName}
                        </span>
                      )}
                    </div>
                    {item.highlights && <SearchResultHighlights highlights={item.highlights} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!query && (
            <div className="py-8 text-center text-sm text-gray-400">
              {t('search.startTyping')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
