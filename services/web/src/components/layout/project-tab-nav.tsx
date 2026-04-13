import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Board',     path: 'board' },
  { label: 'Backlog',   path: 'backlog' },
  { label: 'Issues',    path: 'issues' },
  { label: 'Calendar',  path: 'calendar' },
  { label: 'Timeline',  path: 'timeline' },
  { label: 'Pages',     path: 'pages' },
  { label: 'Reports',   path: 'reports' },
  { label: 'Settings',  path: 'settings' },
] as const

interface ProjectTabNavProps {
  projectKey: string
}

export function ProjectTabNav({ projectKey }: ProjectTabNavProps) {
  const location = useLocation()

  return (
    <nav aria-label="Project navigation">
      <div className="flex gap-1 px-6 pt-3 border-b border-border bg-card flex-shrink-0 overflow-x-auto">
        {TABS.map((tab) => {
          const href = `/projects/${projectKey}/${tab.path}`
          const isActive = location.pathname === href || location.pathname.startsWith(href + '/')
          return (
            <Link
              key={tab.path}
              to={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
