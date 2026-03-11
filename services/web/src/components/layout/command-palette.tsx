import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search,
  ArrowRight,
  LayoutDashboard,
  FolderOpen,
  CircleDot,
  Bell,
  Settings,
  Plus,
  Clock,
  Hash,
  FileText,
  Columns3,
  ListTodo,
  List,
  BarChart3,
  Users,
  Shield,
  Zap,
  CornerDownLeft,
  ArrowUpDown,
  Command,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { useSearch, SearchResultItem, SearchHighlight } from '@/hooks/useSearch'
import { useProjects } from '@/hooks/useProjects'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { IssueType } from '@/types'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  section: string
  keywords?: string
  shortcut?: string
  onSelect: () => void
}

// ─── Highlighted text renderer ──────────────────────────────

function HighlightedText({ html }: { html: string }) {
  const parts = html.split(/(<mark>|<\/mark>)/)
  let inside = false
  const elements: React.ReactNode[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === '<mark>') { inside = true; continue }
    if (part === '</mark>') { inside = false; continue }
    if (inside) {
      elements.push(
        <mark key={i} className="bg-yellow-200/80 dark:bg-yellow-700/40 text-yellow-900 dark:text-yellow-200 rounded-sm px-0.5">
          {part}
        </mark>
      )
    } else {
      elements.push(part)
    }
  }
  return <>{elements}</>
}

// ─── Main Component ─────────────────────────────────────────

export function CommandPalette() {
  const { isSearchOpen, setSearchOpen } = useUiStore()
  const user = useAuthStore((s) => s.user)
  const { theme, setTheme } = useThemeStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const isAdmin = user?.role === 'admin' || (user?.role as string) === 'owner'

  // Detect current project context
  const currentProjectKey = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/)
    return match ? match[1] : null
  }, [location.pathname])

  // ─── Data ────────────────────────────────────────────────

  const { data: projects } = useProjects()
  const isCommandMode = query.startsWith('>')
  const searchQuery = isCommandMode ? '' : query
  const { data: searchData, isLoading: isSearching } = useSearch(searchQuery)
  const searchResults: SearchResultItem[] = searchData?.items || []

  // ─── Navigation helper ───────────────────────────────────

  const go = useCallback((path: string) => {
    navigate(path)
    setSearchOpen(false)
  }, [navigate, setSearchOpen])

  // ─── Command definitions ─────────────────────────────────

  const commands = useMemo<CommandItem[]>(() => {
    const cmds: CommandItem[] = []

    // — Quick Actions —
    cmds.push({
      id: 'create-issue',
      label: 'Create New Issue',
      description: 'Open the new issue form',
      icon: <Plus className="h-4 w-4" />,
      section: 'Actions',
      keywords: 'new add task bug story create issue',
      shortcut: 'C',
      onSelect: () => {
        // Navigate to current project issues or general
        if (currentProjectKey) {
          go(`/projects/${currentProjectKey}/issues?create=true`)
        } else {
          go('/issues?create=true')
        }
      },
    })

    // — Theme Commands —
    cmds.push(
      {
        id: 'theme-light',
        label: 'Switch to Light Mode',
        icon: <Sun className="h-4 w-4" />,
        section: 'Actions',
        keywords: 'theme light mode appearance',
        onSelect: () => { setTheme('light'); setSearchOpen(false) },
      },
      {
        id: 'theme-dark',
        label: 'Switch to Dark Mode',
        icon: <Moon className="h-4 w-4" />,
        section: 'Actions',
        keywords: 'theme dark mode appearance night',
        onSelect: () => { setTheme('dark'); setSearchOpen(false) },
      },
      {
        id: 'theme-system',
        label: 'Use System Theme',
        icon: <Monitor className="h-4 w-4" />,
        section: 'Actions',
        keywords: 'theme system auto mode appearance',
        onSelect: () => { setTheme('system'); setSearchOpen(false) },
      },
    )

    // — Navigation —
    cmds.push(
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        icon: <LayoutDashboard className="h-4 w-4" />,
        section: 'Navigation',
        keywords: 'home overview dashboard',
        onSelect: () => go('/dashboard'),
      },
      {
        id: 'nav-projects',
        label: 'Go to Projects',
        icon: <FolderOpen className="h-4 w-4" />,
        section: 'Navigation',
        keywords: 'projects list all',
        onSelect: () => go('/projects'),
      },
      {
        id: 'nav-my-issues',
        label: 'Go to My Issues',
        icon: <CircleDot className="h-4 w-4" />,
        section: 'Navigation',
        keywords: 'my issues assigned tasks',
        onSelect: () => go('/issues'),
      },
      {
        id: 'nav-notifications',
        label: 'Go to Notifications',
        icon: <Bell className="h-4 w-4" />,
        section: 'Navigation',
        keywords: 'notifications alerts inbox',
        onSelect: () => go('/notifications'),
      },
      {
        id: 'nav-timesheet',
        label: 'Go to Timesheet',
        icon: <Clock className="h-4 w-4" />,
        section: 'Navigation',
        keywords: 'timesheet time tracking hours',
        onSelect: () => go('/timesheet'),
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        icon: <Settings className="h-4 w-4" />,
        section: 'Navigation',
        keywords: 'settings preferences profile account',
        onSelect: () => go('/settings'),
      },
    )

    if (isAdmin) {
      cmds.push(
        {
          id: 'nav-team',
          label: 'Go to Team Management',
          icon: <Users className="h-4 w-4" />,
          section: 'Navigation',
          keywords: 'team members invite users',
          onSelect: () => go('/settings/team'),
        },
        {
          id: 'nav-audit-logs',
          label: 'Go to Audit Logs',
          icon: <Shield className="h-4 w-4" />,
          section: 'Navigation',
          keywords: 'audit logs security history',
          onSelect: () => go('/admin/audit-logs'),
        },
      )
    }

    // — Project-specific commands —
    if (currentProjectKey) {
      cmds.push(
        {
          id: 'proj-board',
          label: 'Go to Board',
          description: currentProjectKey,
          icon: <Columns3 className="h-4 w-4" />,
          section: 'Current Project',
          keywords: 'board kanban columns',
          onSelect: () => go(`/projects/${currentProjectKey}/board`),
        },
        {
          id: 'proj-backlog',
          label: 'Go to Backlog',
          description: currentProjectKey,
          icon: <ListTodo className="h-4 w-4" />,
          section: 'Current Project',
          keywords: 'backlog sprint planning grooming',
          onSelect: () => go(`/projects/${currentProjectKey}/backlog`),
        },
        {
          id: 'proj-issues',
          label: 'Go to Issues',
          description: currentProjectKey,
          icon: <List className="h-4 w-4" />,
          section: 'Current Project',
          keywords: 'issues list all tasks',
          onSelect: () => go(`/projects/${currentProjectKey}/issues`),
        },
        {
          id: 'proj-reports',
          label: 'Go to Reports',
          description: currentProjectKey,
          icon: <BarChart3 className="h-4 w-4" />,
          section: 'Current Project',
          keywords: 'reports analytics burndown velocity',
          onSelect: () => go(`/projects/${currentProjectKey}/reports`),
        },
      )
    }

    // — Switch to project commands —
    if (projects && projects.length > 0) {
      for (const project of projects.slice(0, 8)) {
        cmds.push({
          id: `switch-project-${project.id}`,
          label: `${project.name}`,
          description: project.key,
          icon: (
            <span className="h-4 w-4 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
              {project.key.slice(0, 2)}
            </span>
          ),
          section: 'Projects',
          keywords: `${project.name} ${project.key} project switch`,
          onSelect: () => go(`/projects/${project.key}/board`),
        })
      }
    }

    return cmds
  }, [currentProjectKey, projects, isAdmin, go, setTheme, setSearchOpen])

  // ─── Filter commands ─────────────────────────────────────

  const filteredCommands = useMemo(() => {
    const commandQuery = isCommandMode ? query.slice(1).trim() : query
    if (!commandQuery) return commands

    const lower = commandQuery.toLowerCase()
    return commands.filter((cmd) => {
      const searchable = `${cmd.label} ${cmd.description || ''} ${cmd.keywords || ''}`.toLowerCase()
      return searchable.includes(lower)
    })
  }, [commands, query, isCommandMode])

  // ─── Build flat items list for keyboard nav ──────────────

  type FlatItem =
    | { type: 'command'; item: CommandItem }
    | { type: 'search-result'; item: SearchResultItem }

  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = []

    if (isCommandMode || !query) {
      // Show commands
      for (const cmd of filteredCommands) {
        items.push({ type: 'command', item: cmd })
      }
    } else if (query.length >= 2) {
      // Show search results + relevant commands
      for (const result of searchResults) {
        items.push({ type: 'search-result', item: result })
      }
      // Also show matching commands below search results
      const matchingCmds = filteredCommands.filter(
        (cmd) => cmd.section === 'Actions' || cmd.section === 'Navigation'
      )
      for (const cmd of matchingCmds.slice(0, 4)) {
        items.push({ type: 'command', item: cmd })
      }
    } else {
      // Short query (1 char) - show commands
      for (const cmd of filteredCommands) {
        items.push({ type: 'command', item: cmd })
      }
    }

    return items
  }, [filteredCommands, searchResults, query, isCommandMode])

  // ─── Group items by section for rendering ────────────────

  type Section = { title: string; items: (FlatItem & { flatIndex: number })[] }

  const sections = useMemo<Section[]>(() => {
    const sectionMap = new Map<string, (FlatItem & { flatIndex: number })[]>()

    flatItems.forEach((fi, index) => {
      let sectionTitle: string
      if (fi.type === 'search-result') {
        sectionTitle = 'Issues'
      } else {
        sectionTitle = fi.item.section
      }

      if (!sectionMap.has(sectionTitle)) {
        sectionMap.set(sectionTitle, [])
      }
      sectionMap.get(sectionTitle)!.push({ ...fi, flatIndex: index })
    })

    const result: Section[] = []

    // Define section order
    const order = ['Actions', 'Current Project', 'Issues', 'Navigation', 'Projects']
    for (const title of order) {
      if (sectionMap.has(title)) {
        result.push({ title, items: sectionMap.get(title)! })
        sectionMap.delete(title)
      }
    }
    // Any remaining sections
    for (const [title, items] of sectionMap) {
      result.push({ title, items })
    }

    return result
  }, [flatItems])

  // ─── Keyboard shortcut to open ───────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(!isSearchOpen)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setSearchOpen, isSearchOpen])

  // ─── Focus input on open ─────────────────────────────────

  useEffect(() => {
    if (isSearchOpen) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isSearchOpen])

  // ─── Reset active index on items change ──────────────────

  useEffect(() => {
    setActiveIndex(0)
  }, [flatItems.length])

  // ─── Scroll active item into view ────────────────────────

  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector('[data-active="true"]')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  // ─── Keyboard navigation ─────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setSearchOpen(false)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1))
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems[activeIndex]
      if (!item) return

      if (item.type === 'command') {
        item.item.onSelect()
      } else {
        go(`/issues/${item.item.id}`)
      }
      return
    }
  }

  // ─── Render ──────────────────────────────────────────────

  if (!isSearchOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={() => setSearchOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-[560px] mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl dark:shadow-black/50 border border-gray-200/80 dark:border-gray-700 overflow-hidden flex flex-col max-h-[min(480px,70vh)]">
        {/* ── Input ── */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <Search className="h-[18px] w-[18px] text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={isCommandMode ? 'Type a command...' : 'Search issues, or type > for commands...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 text-[14px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none bg-transparent"
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {query && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus() }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Clear
              </button>
            )}
            <kbd className="text-[11px] text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 font-mono leading-none">
              ESC
            </kbd>
          </div>
        </div>

        {/* ── Results ── */}
        <div ref={listRef} className="overflow-y-auto flex-1 overscroll-contain">
          {/* Loading state */}
          {isSearching && query.length >= 2 && !isCommandMode && (
            <div className="flex items-center gap-2 px-4 py-6 justify-center">
              <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Searching...</span>
            </div>
          )}

          {/* No results */}
          {!isSearching && query.length >= 2 && !isCommandMode && searchResults.length === 0 && filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try a different search term or type <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400 font-mono">&gt;</kbd> for commands</p>
            </div>
          )}

          {/* Sections */}
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-4 pt-2.5 pb-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {section.title}
                </span>
              </div>
              {section.items.map(({ type, item, flatIndex }) => {
                const isActive = flatIndex === activeIndex

                if (type === 'search-result') {
                  const issue = item as SearchResultItem
                  return (
                    <button
                      key={`sr-${issue.id}`}
                      data-active={isActive}
                      onClick={() => go(`/issues/${issue.id}`)}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                        isActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      <IssueTypeIcon type={issue.type as IssueType} className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-blue-600 dark:text-blue-400 flex-shrink-0">{issue.key}</span>
                          <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{issue.title}</span>
                        </div>
                        {issue.highlights && issue.highlights.length > 0 && (
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                            <HighlightedText html={issue.highlights[0].snippets[0]} />
                          </div>
                        )}
                      </div>
                      {issue.projectName && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 font-medium">
                          {issue.projectName}
                        </span>
                      )}
                    </button>
                  )
                }

                // Command item
                const cmd = item as CommandItem
                return (
                  <button
                    key={cmd.id}
                    data-active={isActive}
                    onClick={cmd.onSelect}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                      isActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                    )}
                  >
                    <span className={cn(
                      'flex items-center justify-center h-7 w-7 rounded-md flex-shrink-0',
                      isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                    )}>
                      {cmd.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        'text-sm',
                        isActive ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300',
                      )}>
                        {cmd.label}
                      </span>
                      {cmd.description && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{cmd.description}</span>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd className={cn(
                        'text-[11px] border rounded px-1.5 py-0.5 font-mono leading-none flex-shrink-0',
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500',
                      )}>
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Empty command mode */}
          {isCommandMode && filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">No commands matching &ldquo;{query.slice(1)}&rdquo;</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" /> Navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> Select
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono">ESC</span> Close
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </div>
      </div>
    </div>
  )
}
