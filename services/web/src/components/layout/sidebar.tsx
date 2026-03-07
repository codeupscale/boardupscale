import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  CircleDot,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Shield,
  Columns3,
  List,
  ListTodo,
  BarChart3,
  Settings2,
} from 'lucide-react'
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
  const { isSidebarOpen, toggleSidebar } = useUiStore()
  const user = useAuthStore((s) => s.user)
  const { data: projects } = useProjects()

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  const navItems = [
    { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
    { icon: FolderOpen, label: t('nav.projects'), href: '/projects' },
    { icon: CircleDot, label: t('nav.myIssues'), href: '/issues' },
    { icon: Bell, label: t('nav.notifications'), href: '/notifications' },
    { icon: Settings, label: t('nav.settings'), href: '/settings' },
    ...(isAdmin ? [{ icon: Shield, label: t('nav.auditLogs'), href: '/admin/audit-logs' }] : []),
  ]

  const isActive = (href: string) => {
    if (href === '/dashboard') return location.pathname === href
    return location.pathname.startsWith(href)
  }

  // Detect current project from URL
  const currentProjectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/)
    return match ? match[1] : null
  }, [location.pathname])

  const currentProject = useMemo(() => {
    if (!currentProjectId || !projects) return null
    return projects.find((p) => p.id === currentProjectId) || null
  }, [currentProjectId, projects])

  const projectSubNav = [
    { icon: Columns3, label: 'Board', path: 'board' },
    { icon: ListTodo, label: 'Backlog', path: 'backlog' },
    { icon: List, label: 'Issues', path: 'issues' },
    { icon: BarChart3, label: 'Reports', path: 'reports' },
    { icon: Settings2, label: 'Settings', path: 'settings' },
  ]

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-200 z-40',
        isSidebarOpen ? 'w-60' : 'w-16',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-center h-8 w-8 bg-blue-600 rounded-lg flex-shrink-0">
          <Zap className="h-5 w-5 text-white" />
        </div>
        {isSidebarOpen && (
          <span className="font-bold text-gray-900 text-base tracking-tight">ProjectFlow</span>
        )}
      </div>

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
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  !isSidebarOpen && 'justify-center px-2',
                )}
              >
                <Icon
                  className={cn('h-5 w-5 flex-shrink-0', active ? 'text-blue-600' : 'text-gray-500')}
                />
                {isSidebarOpen && label}
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {currentProject.key} - {currentProject.name}
            </p>
            <div className="space-y-0.5">
              {projectSubNav.map(({ icon: Icon, label, path }) => {
                const href = `/projects/${currentProjectId}/${path}`
                const active = location.pathname === href
                return (
                  <Link
                    key={path}
                    to={href}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                      active
                        ? 'text-blue-700 bg-blue-50'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-blue-600' : 'text-gray-400')} />
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {t('nav.recentProjects')}
            </p>
            <div className="space-y-0.5">
              {projects.slice(0, 5).map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}/board`}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                    location.pathname.includes(project.id)
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <span className="h-5 w-5 rounded bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
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
      <div className="border-t border-gray-200 flex-shrink-0">
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
                <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className={cn(
            'w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors border-t border-gray-100',
            !isSidebarOpen && 'justify-center px-2',
          )}
        >
          {isSidebarOpen ? (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>{t('common.collapse')}</span>
            </>
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  )
}
