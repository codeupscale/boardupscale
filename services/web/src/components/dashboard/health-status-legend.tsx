import { cn } from '@/lib/utils'
import {
  getHealthStatusColor,
  getHealthStatusLabel,
} from '@/components/dashboard/dashboard-chart-theme'

export interface HealthLegendItem {
  key: string
  count: number
  percent: number
}

interface HealthStatusLegendProps {
  items: HealthLegendItem[]
  className?: string
  compact?: boolean
  /** When set, legend rows are clickable filters. */
  selectedKey?: string | 'all'
  onSelect?: (key: string) => void
  /** Override segment color/label resolution (default: project-health palette). */
  getColor?: (key: string) => string
  getLabel?: (key: string) => string
}

export function HealthStatusLegend({
  items,
  className,
  compact = false,
  selectedKey,
  onSelect,
  getColor = getHealthStatusColor,
  getLabel = getHealthStatusLabel,
}: HealthStatusLegendProps) {
  const interactive = typeof onSelect === 'function'

  return (
    <ul className={cn('min-w-0 space-y-1.5', className)} role={interactive ? 'listbox' : undefined}>
      {items.map((item) => {
        const isSelected = selectedKey === item.key
        const isDimmed =
          interactive && selectedKey && selectedKey !== 'all' && !isSelected

        const content = (
          <>
            <span className="flex items-center gap-2 text-muted-foreground truncate min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getColor(item.key) }}
              />
              {getLabel(item.key)}
            </span>
            <span className="font-medium text-foreground tabular-nums whitespace-nowrap">
              {item.count}
              <span className="text-muted-foreground font-normal">
                {' '}
                ({item.percent}%)
              </span>
            </span>
          </>
        )

        if (interactive) {
          return (
            <li key={item.key}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(item.key)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors text-left',
                  compact ? 'text-[11px]' : 'text-sm',
                  item.count === 0 && 'opacity-50',
                  isDimmed && 'opacity-40',
                  isSelected && 'bg-violet-500/10 ring-1 ring-violet-500/30',
                  'hover:bg-muted/40',
                )}
              >
                {content}
              </button>
            </li>
          )
        }

        return (
          <li
            key={item.key}
            className={cn(
              'flex items-center justify-between gap-2',
              compact ? 'text-[11px]' : 'text-sm',
              item.count === 0 && 'opacity-50',
            )}
          >
            {content}
          </li>
        )
      })}
    </ul>
  )
}
