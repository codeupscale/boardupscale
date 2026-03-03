import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useSearch } from '@/hooks/useSearch'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { cn } from '@/lib/utils'
import { Issue } from '@/types'

export function SearchModal() {
  const { isSearchOpen, setSearchOpen } = useUiStore()
  const [query, setQuery] = useState('')
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
    }
  }, [isSearchOpen])

  if (!isSearchOpen) return null

  const issues: Issue[] = data?.issues || []

  const handleSelect = (issue: Issue) => {
    navigate(`/issues/${issue.id}`)
    setSearchOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setSearchOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search issues, projects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading && query.length >= 2 && (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              Searching...
            </div>
          )}

          {!isLoading && query.length >= 2 && issues.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-500">
              No results found for "{query}"
            </div>
          )}

          {issues.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                Issues
              </div>
              {issues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => handleSelect(issue)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <IssueTypeIcon type={issue.type} className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs font-mono text-blue-600 flex-shrink-0">{issue.key}</span>
                  <span className="text-sm text-gray-900 truncate">{issue.title}</span>
                </button>
              ))}
            </div>
          )}

          {!query && (
            <div className="py-8 text-center text-sm text-gray-400">
              Start typing to search...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
