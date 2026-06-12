import { useMemo, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutGrid,
  Layers,
  BellDot,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UsersRound,
  Columns3,
  List,
  ListTodo,
  CalendarRange,
  BarChart4,
  Settings2,
  Timer,
  Upload,
  CreditCard,
  BookOpen,
  UserCircle,
  History,
  ArrowLeftRight,
} from 'lucide-react'
/* ── Recent-project localStorage helpers ─────────────────────────── */
// Key is scoped per org + user so different users on the same browser
// never share visit history.
const recentProjectsKey = (orgId: string, userId: string) =>
  `boardupscale:recent-projects:${orgId}:${userId}`

type RecentProject = { key: string; name: string }

function readRecentProjects(orgId: string, userId: string): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(recentProjectsKey(orgId, userId)) || '[]')
  } catch {
    return []
  }
}

function pushRecentProject(orgId: string, userId: string, project: RecentProject) {
  const list = readRecentProjects(orgId, userId).filter((p) => p.key !== project.key)
  list.unshift(project)
  localStorage.setItem(recentProjectsKey(orgId, userId), JSON.stringify(list.slice(0, 5)))
}
/* ────────────────────────────────────────────────────────────────── */

import { Logo } from '@/components/Logo'
import { OrgSwitcher } from '@/components/layout/org-switcher'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useProjects } from '@/hooks/useProjects'
import { UserRole } from '@/types'
import { isKanbanProject } from '@/lib/project-workflow'
import { Avatar } from '@/components/ui/avatar'
import { Tooltip } from '@/components/ui/tooltip'

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { isSidebarOpen, toggleSidebar, setSidebarOpen } = useUiStore()
  const user = useAuthStore((s) => s.user)
  const { data: projectsResult } = useProjects()
  const projects = projectsResult?.data
  const orgId = user?.organizationId ?? ''
  const userId = user?.id ?? ''

  // Recently visited projects — scoped per org+user so different users on the
  // same browser never see each other's visit history.
  // Initialized lazily once orgId/userId are known.
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() =>
    orgId && userId ? readRecentProjects(orgId, userId) : [],
  )

  // Re-hydrate the list whenever the logged-in user or org changes.
  useEffect(() => {
    setRecentProjects(orgId && userId ? readRecentProjects(orgId, userId) : [])
  }, [orgId, userId])

  // Close sidebar on mobile on initial mount
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [setSidebarOpen])

  // Auto-close sidebar on navigation when on mobile
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [location.pathname, setSidebarOpen])

  // Track last-visited project on every navigation
  useEffect(() => {
    if (!orgId || !userId) return
    const match = location.pathname.match(/^\/projects\/([^/]+)/)
    if (!match) return
    const key = match[1]
    const project = projects?.find((p) => p.key === key)
    if (!project) return
    pushRecentProject(orgId, userId, { key: project.key, name: project.name })
    setRecentProjects(readRecentProjects(orgId, userId))
  }, [location.pathname, projects, orgId, userId])

  const isAdmin = user?.role === UserRole.OWNER || user?.role === UserRole.ADMINISTRATOR
  const isOwner = user?.role === UserRole.OWNER

  const navItems = [
    { icon: LayoutGrid, label: t('nav.dashboard'), href: '/dashboard' },
    { icon: Layers, label: t('nav.projects'), href: '/projects' },
    { icon: Timer, label: 'Timesheet', href: '/timesheet' },
    { icon: BellDot, label: t('nav.notifications'), href: '/notifications' },
    { icon: SlidersHorizontal, label: t('nav.settings'), href: '/settings' },
  ]

  const settingsSubNav = [
    { icon: UserCircle, label: 'Profile', href: '/settings' },
    ...(isAdmin ? [{ icon: UsersRound, label: 'Team', href: '/settings/team' }] : []),
    ...(isAdmin ? [{ icon: CreditCard, label: 'Billing', href: '/settings/billing' }] : []),
    ...(isOwner ? [{ icon: ShieldCheck, label: 'Roles', href: '/settings/roles' }] : []),
    ...(isAdmin ? [{ icon: Upload, label: 'Import', href: '/import' }] : []),
    ...(isAdmin ? [{ icon: ArrowLeftRight, label: 'Migrate from Jira', href: '/settings/migrate/jira' }] : []),
    ...(isAdmin ? [{ icon: History, label: t('nav.auditLogs'), href: '/admin/audit-logs' }] : []),
  ]

  const isOnSettingsPath =
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/admin') ||
    location.pathname === '/import'

  const isActive = (href: string) => {
    if (href === '/dashboard') return location.pathname === href
    if (href === '/settings') return isOnSettingsPath
    return location.pathname.startsWith(href)
  }

  // Detect current project from URL (now uses project key)
  const currentProjectKey = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/)
    return match ? match[1] : null
  }, [location.pathname])

  const currentProject = useMemo(() => {
    if (!currentProjectKey || !projects) return null
    return projects.find((p) => p.key === currentProjectKey) || null
  }, [currentProjectKey, projects])

  const projectSubNav = useMemo(() => {
    const items = [
      { icon: Columns3, label: 'Board', path: 'board' },
      { icon: ListTodo, label: 'Backlog', path: 'backlog' },
      { icon: List, label: 'Issues', path: 'issues' },
      { icon: CalendarRange, label: 'Calendar', path: 'calendar' },
      { icon: BarChart4, label: 'Timeline', path: 'timeline' },
      { icon: BookOpen, label: 'Pages', path: 'pages' },
      { icon: BarChart4, label: 'Reports', path: 'reports' },
      { icon: Settings2, label: 'Settings', path: 'settings' },
    ]
    if (isKanbanProject(currentProject?.type)) {
      return items.filter((item) => item.path !== 'backlog')
    }
    return items
  }, [currentProject?.type])

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden"
          onClick={toggleSidebar}
        />
      )}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={cn(
          'fixed left-0 top-0 h-full plasma-sidebar flex flex-col transition-all duration-200 z-40',
          'md:relative',
          isSidebarOpen ? 'w-60' : 'w-16',
          !isSidebarOpen && 'max-md:-translate-x-full',
        )}
      >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 flex-shrink-0',
        isSidebarOpen ? 'justify-center' : 'justify-center',
      )}>
        <Logo
          size="sm"
          variant={isSidebarOpen ? 'full' : 'icon'}
        />
      </div>

      {/* Divider after logo */}
      <div className="sidebar-divider !mt-0 !mb-0" />

      {/* Organization Switcher */}
      <OrgSwitcher />

      {/* Divider after org */}
      <div className="sidebar-divider !mt-0 !mb-0" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="px-2 space-y-0.5">
          {navItems.map(({ icon: Icon, label, href }) => {
            const active = isActive(href)
            const item = (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 sidebar-nav-hover',
                  active
                    ? 'plasma-nav-active shadow-sm'
                    : 'text-foreground/70',
                  !isSidebarOpen && 'justify-center px-2',
                )}
              >
                <div className={cn(
                  'flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0 transition-colors',
                  active
                    ? ''
                    : 'bg-muted/60 dark:bg-muted/40',
                )}>
                  <Icon className={cn('h-4 w-4', active ? '' : 'text-muted-foreground')} />
                </div>
                {isSidebarOpen ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
              </Link>
            )

            if (!isSidebarOpen) {
              return (
                <Tooltip key={href} content={label} side="right">
                  {item}
                </Tooltip>
              )
            }
            return item
          })}
        </div>

        {/* Current Project Navigation */}
        {isSidebarOpen && currentProject && (
          <>
            <div className="sidebar-divider" />
            <div className="px-3">
              <div className="sidebar-section-label mb-2">
                {currentProject.key} · {currentProject.name}
              </div>
              <div className="space-y-0.5 pl-1">
                {projectSubNav.map(({ icon: Icon, label, path }) => {
                  const href = `/projects/${currentProjectKey}/${path}`
                  const active = location.pathname === href
                  return (
                    <Link
                      key={path}
                      to={href}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-150 sidebar-nav-hover',
                        active
                          ? 'plasma-nav-active font-medium'
                          : 'text-foreground/70',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 flex-shrink-0', active ? '' : 'text-muted-foreground')} />
                      <span className="truncate">{label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Settings Sub-Navigation */}
        {isSidebarOpen && isOnSettingsPath && (
          <>
            <div className="sidebar-divider" />
            <div className="px-3">
              <div className="sidebar-section-label mb-2">
                Account & Settings
              </div>
              <div className="space-y-0.5 pl-1">
                {settingsSubNav.map(({ icon: Icon, label, href }) => {
                  const active =
                    href === '/settings'
                      ? location.pathname === '/settings'
                      : location.pathname.startsWith(href)
                  return (
                    <Link
                      key={href}
                      to={href}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-150 sidebar-nav-hover',
                        active
                          ? 'plasma-nav-active font-medium'
                          : 'text-foreground/70',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          active ? '' : 'text-muted-foreground',
                        )}
                      />
                      <span className="truncate">{label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Recent Projects */}
        {isSidebarOpen && recentProjects.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="px-3">
              <div className="sidebar-section-label mb-2">
                {t('nav.recentProjects')}
              </div>
              <div className="space-y-0.5 pl-1">
                {recentProjects.map((project) => {
                  const isProjectActive = location.pathname.includes(project.key)
                  return (
                    <Link
                      key={project.key}
                      to={`/projects/${project.key}/board`}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-150 sidebar-nav-hover',
                        isProjectActive
                          ? 'plasma-nav-active font-medium'
                          : 'text-foreground/70',
                      )}
                    >
                      <span className={cn(
                        'h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                        isProjectActive
                          ? 'project-badge'
                          : 'sidebar-project-badge',
                      )}>
                        {project.key.slice(0, 2)}
                      </span>
                      <span className="truncate">{project.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </nav>

      {/* User + Collapse */}
      <div className="flex-shrink-0 sidebar-user-card">
        {/* User info */}
        {user && (
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3',
              !isSidebarOpen && 'justify-center px-2',
            )}
          >
            <div className="relative flex-shrink-0">
              <Avatar user={user} size="sm" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background ring-1 ring-emerald-400/30" />
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          aria-expanded={isSidebarOpen}
          aria-label="Toggle sidebar"
          className={cn(
            'w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border-t border-border/30 hover:bg-accent/30',
            !isSidebarOpen && 'justify-center px-2',
          )}
        >
          {isSidebarOpen ? (
            <>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>{t('common.collapse')}</span>
            </>
          ) : (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="sr-only">{t('common.collapse')}</span>
            </>
          )}
        </button>
      </div>
    </aside>
    </>
  )
}
