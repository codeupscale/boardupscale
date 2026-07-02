import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, FolderOpen, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import {
  useSearch,
  getMemberSearchPath,
  SearchIssueItem,
  SearchProjectItem,
  SearchMemberItem,
  SearchHighlight,
  SearchResultItem,
} from '@/hooks/useSearch'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { IssueType, UserRole } from '@/types'
import { cn } from '@/lib/utils'

import { HighlightedText } from '@/components/search/highlighted-text'

function SearchResultHighlights({ highlights }: { highlights: SearchHighlight[] }) {
  const { t } = useTranslation()
  if (!highlights || highlights.length === 0) return null
  const shown = highlights.slice(0, 2)

  const fieldLabel = (field: string) =>
    t(`search.highlightFields.${field}`, { defaultValue: field })

  return (
    <div className="mt-1 space-y-0.5">
      {shown.map((hl) => (
        <div key={hl.field} className="flex items-start gap-1.5 text-xs">
          <span className="text-muted-foreground flex-shrink-0 font-medium">
            {fieldLabel(hl.field)}:
          </span>
          <span className="text-muted-foreground line-clamp-1">
            <HighlightedText html={hl.snippets[0]} />
          </span>
        </div>
      ))}
    </div>
  )
}

interface FlatResult {
  item: SearchResultItem
  section: 'issues' | 'projects' | 'members'
}

export function SearchModal() {
  const { t } = useTranslation()
  const { isSearchOpen, setSearchOpen } = useUiStore()
  const user = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { data, isLoading, isError } = useSearch(query)

  const canOpenOrgTeam =
    user?.role === UserRole.OWNER || user?.role === UserRole.ADMINISTRATOR

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

  const flatResults = useMemo<FlatResult[]>(() => {
    if (!data) return []
    const rows: FlatResult[] = []
    for (const item of data.issues) rows.push({ item, section: 'issues' })
    for (const item of data.projects) rows.push({ item, section: 'projects' })
    for (const item of data.members) rows.push({ item, section: 'members' })
    return rows
  }, [data])

  const sectionLabels: Record<FlatResult['section'], string> = {
    issues: t('search.issues'),
    projects: t('search.projects'),
    members: t('search.members'),
  }

  const handleSelect = (item: SearchResultItem) => {
    if (item.kind === 'issue') {
      navigate(`/issues/${item.id}`)
      setSearchOpen(false)
      return
    }
    if (item.kind === 'project') {
      navigate(`/projects/${item.key}/board`)
      setSearchOpen(false)
      return
    }
    const path = getMemberSearchPath(item, canOpenOrgTeam)
    if (!path) return
    navigate(path)
    setSearchOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < flatResults.length) {
      e.preventDefault()
      handleSelect(flatResults[activeIndex].item)
    }
  }

  if (!isSearchOpen) return null

  const searchSource = data?.source
  const hasResults = flatResults.length > 0

  let lastSection: FlatResult['section'] | null = null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      role="dialog"
      aria-modal="true"
      aria-label={t('search.dialogLabel')}
    >
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        onClick={() => setSearchOpen(false)}
      />

      <div className="relative w-full max-w-xl bg-card rounded-xl shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
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
            aria-activedescendant={
              activeIndex >= 0 && flatResults[activeIndex]
                ? `search-option-${flatResults[activeIndex].item.id}`
                : undefined
            }
            aria-controls="search-results-listbox"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded={hasResults}
            className="flex-1 text-sm text-foreground placeholder:text-muted-foreground outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('search.clear')}
              className="text-muted-foreground hover:text-foreground/80"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading && query.length >= 2 && (
            <div className="space-y-2 p-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}

          {isError && query.length >= 2 && (
            <div className="py-8 text-center text-sm text-destructive">
              {t('search.error')}
            </div>
          )}

          {!isLoading && !isError && query.length >= 2 && !hasResults && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('search.noResultsFor', { query })}
            </div>
          )}

          {hasResults && (
            <div>
              {searchSource === 'elasticsearch' && (
                <div className="flex justify-end px-4 py-1 border-b border-border">
                  <span className="text-[10px] text-muted-foreground/50 font-mono">ES</span>
                </div>
              )}
              <div id="search-results-listbox" role="listbox" aria-label={t('search.dialogLabel')}>
                {flatResults.map(({ item, section }, index) => {
                  const showHeader = section !== lastSection
                  lastSection = section

                  return (
                    <div key={`${section}-${item.id}`}>
                      {showHeader && (
                        <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                          {sectionLabels[section]}
                        </div>
                      )}
                      <button
                        id={`search-option-${item.id}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        aria-disabled={item.kind === 'member' && !getMemberSearchPath(item, canOpenOrgTeam)}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          'w-full flex flex-col px-4 py-2.5 hover:bg-accent transition-colors text-left',
                          index === activeIndex && 'bg-primary/10',
                          item.kind === 'member' &&
                            !getMemberSearchPath(item, canOpenOrgTeam) &&
                            'opacity-60 cursor-not-allowed hover:bg-transparent',
                        )}
                      >
                        {item.kind === 'issue' && <IssueRow item={item} />}
                        {item.kind === 'project' && <ProjectRow item={item} />}
                        {item.kind === 'member' && (
                          <MemberRow
                            item={item}
                            navigable={!!getMemberSearchPath(item, canOpenOrgTeam)}
                          />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!query && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('search.startTyping')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function IssueRow({ item }: { item: SearchIssueItem }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center gap-3">
        <IssueTypeIcon type={item.type as IssueType} className="h-4 w-4 flex-shrink-0" />
        <span className="text-xs font-mono text-primary flex-shrink-0">{item.key}</span>
        <span className="text-sm text-foreground truncate">{item.title}</span>
        {item.projectName && (
          <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">
            {item.projectName}
          </span>
        )}
      </div>
      {item.matchedFormerKey && (
        <p className="mt-0.5 text-[10px] text-muted-foreground pl-7">
          {t('search.matchedFormerKey', { formerKey: item.matchedFormerKey })}
        </p>
      )}
      {item.highlights && <SearchResultHighlights highlights={item.highlights} />}
    </>
  )
}

function ProjectRow({ item }: { item: SearchProjectItem }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center gap-3">
        <FolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span className="text-xs font-mono text-primary flex-shrink-0">{item.key}</span>
        <span className="text-sm text-foreground truncate">{item.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0 capitalize">
          {item.type}
        </span>
      </div>
      {item.matchedFormerKey && (
        <p className="mt-0.5 text-[10px] text-muted-foreground pl-7">
          {t('search.matchedFormerKey', { formerKey: item.matchedFormerKey })}
        </p>
      )}
      {item.highlights?.length ? <SearchResultHighlights highlights={item.highlights} /> : null}
    </>
  )
}

function MemberRow({ item, navigable }: { item: SearchMemberItem; navigable: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar
          src={item.avatarUrl}
          name={item.displayName}
          className="h-6 w-6 flex-shrink-0"
        />
        <span className="text-sm text-foreground truncate">{item.displayName}</span>
        <span className="text-xs text-muted-foreground truncate">{item.email}</span>
        {navigable ? (
          <User className="ml-auto h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        ) : null}
      </div>
      {item.highlights?.length ? <SearchResultHighlights highlights={item.highlights} /> : null}
    </>
  )
}
