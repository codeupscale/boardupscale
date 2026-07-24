import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { DASHBOARD_PANEL } from '@/components/dashboard/dashboard-chart-theme'

interface DashboardPanelCardProps {
  title: string
  headerExtra?: ReactNode
  footerHref?: string
  footerLabel?: string
  children: ReactNode
  className?: string
}

/** Shared shell for org-dashboard chart panels (equal width/height). */
export function DashboardPanelCard({
  title,
  headerExtra,
  footerHref,
  footerLabel,
  children,
  className,
}: DashboardPanelCardProps) {
  return (
    <Card
      className={cn(
        DASHBOARD_PANEL.cardClassName,
        DASHBOARD_PANEL.minHeightClass,
        className,
      )}
    >
      <CardHeader className="py-3 px-4 pb-1 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground tracking-tight truncate">
            {title}
          </h3>
          {headerExtra}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-1 flex flex-col flex-1 min-h-0 gap-3">
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        {footerHref && footerLabel ? (
          <Link
            to={footerHref}
            className="mt-auto pt-1 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            {footerLabel} →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}
