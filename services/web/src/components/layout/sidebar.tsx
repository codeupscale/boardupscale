import { useMemo, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  Users,
  Columns3,
  List,
  ListTodo,
  CalendarDays,
  BarChart3,
  Settings2,
  Clock,
  Upload,
  CreditCard,
  BookOpen,
  User,
  History,
  ArrowLeftRight,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { OrgSwitcher } from '@/components/layout/org-switcher'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useProjects } from '@/hooks/useProjects'
import { Avatar } from '@/components/ui/avatar'
import { Tooltip } from '@/components/ui/tooltip'

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { isSidebarOpen, toggleSidebar, setSidebarOpen } = useUiStore()
  const user = useAuthStore((s) => s.user)
  const { data: projectsResult } = useProjects()
  const projects = projectsResult?.data

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

  const isAdmin = user?.role === 'admin' || (user?.role as string) === 'owner'

  const navItems = [
    { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
    { icon: FolderOpen, label: t('nav.projects'), href: '/projects' },
    { icon: Clock, label: 'Timesheet', href: '/timesheet' },
    { icon: Bell, label: t('nav.notifications'), href: '/notifications' },
    { icon: Settings, label: t('nav.settings'), href: '/settings' },
  ]

  const settingsSubNav = [
    { icon: User, label: 'Profile', href: '/settings' },
    ...(isAdmin ? [{ icon: Users, label: 'Team', href: '/settings/team' }] : []),
    { icon: CreditCard, label: 'Billing', href: '/settings/billing' },
    ...(isAdmin ? [{ icon: Shield, label: 'Roles', href: '/settings/roles' }] : []),
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

  const projectSubNav = [
    { icon: Columns3, label: 'Board', path: 'board' },
    { icon: ListTodo, label: 'Backlog', path: 'backlog' },
    { icon: List, label: 'Issues', path: 'issues' },
    { icon: CalendarDays, label: 'Calendar', path: 'calendar' },
    { icon: BarChart3, label: 'Timeline', path: 'timeline' },
    { icon: BookOpen, label: 'Pages', path: 'pages' },
    { icon: BarChart3, label: 'Reports', path: 'reports' },
    { icon: Settings2, label: 'Settings', path: 'settings' },
  ]

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={toggleSidebar}
        />
      )}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={cn(
          'fixed left-0 top-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-200 z-40',
          'md:relative',
          isSidebarOpen ? 'w-60' : 'w-16',
          // On mobile, hide completely when collapsed
          !isSidebarOpen && 'max-md:-translate-x-full',
        )}
      >
      {/* Logo */}
      <div className="flex items-center px-3 h-14 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <Logo
          size="sm"
          variant={isSidebarOpen ? 'full' : 'icon'}
        />
      </div>

      {/* Organization Switcher */}
      <OrgSwitcher />

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
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200',
                  !isSidebarOpen && 'justify-center px-2',
                )}
              >
                <Icon
                  className={cn('h-5 w-5 flex-shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400')}
                />
                {isSidebarOpen ? label : <span className="sr-only">{label}</span>}
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
          <div className="mt-4 px-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {currentProject.key} - {currentProject.name}
            </p>
            <div className="space-y-0.5">
              {projectSubNav.map(({ icon: Icon, label, path }) => {
                const href = `/projects/${currentProjectKey}/${path}`
                const active = location.pathname === href
                return (
                  <Link
                    key={path}
                    to={href}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                      active
                        ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500')} />
                    <span className="truncate">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Settings Sub-Navigation */}
        {isSidebarOpen && isOnSettingsPath && (
          <div className="mt-4 px-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Account & Settings
            </p>
            <div className="space-y-0.5">
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
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                      active
                        ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 flex-shrink-0',
                        active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent Projects */}
        {isSidebarOpen && projects && projects.length > 0 && (
          <div className="mt-4 px-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {t('nav.recentProjects')}
            </p>
            <div className="space-y-0.5">
              {projects.slice(0, 5).map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.key}/board`}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                    location.pathname.includes(project.key)
                      ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200',
                  )}
                >
                  <span className="h-5 w-5 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
                    {project.key.slice(0, 2)}
                  </span>
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* User + Collapse */}
      <div className="border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        {/* User info */}
        {user && (
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3',
              !isSidebarOpen && 'justify-center px-2',
            )}
          >
            <Avatar user={user} size="sm" />
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
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
            'w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors border-t border-gray-100 dark:border-gray-800',
            !isSidebarOpen && 'justify-center px-2',
          )}
        >
          {isSidebarOpen ? (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>{t('common.collapse')}</span>
            </>
          ) : (
            <>
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">{t('common.collapse')}</span>
            </>
          )}
        </button>
      </div>
    </aside>
    </>
  )
}
