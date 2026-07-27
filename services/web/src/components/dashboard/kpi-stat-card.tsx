import { cn } from '@/lib/utils'

interface KpiStatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  description?: string
  iconClassName?: string
  comingSoon?: boolean
}

/** Compact KPI tile matching org-owner mockup (icon top-left, label, value). */
export function KpiStatCard({
  icon,
  label,
  value,
  description,
  iconClassName,
  comingSoon,
}: KpiStatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card/90 p-3.5 w-full min-w-0 min-h-[118px]',
        'card-elevated plasma-card-hover cursor-default',
      )}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center mb-2.5',
          iconClassName ?? 'bg-violet-500/15 text-violet-400',
        )}
      >
        {icon}
      </div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground tracking-tight leading-none mt-1 truncate">
        {value}
      </p>
      {description && (
        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">{description}</p>
      )}
      {comingSoon && (
        <p className="text-[11px] text-violet-400 mt-1">Coming soon</p>
      )}
    </div>
  )
}
