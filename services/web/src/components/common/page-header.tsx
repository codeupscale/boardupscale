import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  breadcrumbs?: Breadcrumb[]
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white', className)}>
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 mb-1">
            {breadcrumbs.map((crumb, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                {crumb.href ? (
                  <Link
                    to={crumb.href}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-xs text-gray-500">{crumb.label}</span>
                )}
              </div>
            ))}
          </nav>
        )}
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
