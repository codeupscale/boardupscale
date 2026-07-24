import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/utils'
import { DashboardChartTooltip } from '@/components/dashboard/dashboard-chart-tooltip'
import {
  DASHBOARD_EMPTY_RING_FILL,
  DONUT_BOX_PX,
  DonutSizeToken,
  getDonutRadii,
  getHealthStatusColor,
  getHealthStatusLabel,
} from '@/components/dashboard/dashboard-chart-theme'

export interface DashboardDonutSegment {
  key: string
  count: number
  percent: number
}

interface DashboardDonutProps {
  segments: DashboardDonutSegment[]
  total: number
  centerLabel: string
  size?: DonutSizeToken
  className?: string
}

/**
 * Presentational donut — size/radii come from theme tokens, not call-site magic numbers.
 */
export function DashboardDonut({
  segments,
  total,
  centerLabel,
  size = 'lg',
  className,
}: DashboardDonutProps) {
  const boxPx = DONUT_BOX_PX[size]
  const { outer, inner } = getDonutRadii(boxPx)
  const hasData = total > 0

  const chartData = hasData
    ? segments
        .filter((s) => s.count > 0)
        .map((s) => ({
          key: s.key,
          name: getHealthStatusLabel(s.key),
          count: s.count,
          percent: s.percent,
        }))
    : [{ key: 'empty', name: 'Empty', count: 1, percent: 0 }]

  return (
    <div
      className={cn('relative flex-shrink-0', className)}
      style={{ width: boxPx, height: boxPx }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="count"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={outer}
            innerRadius={inner}
            paddingAngle={hasData ? 2 : 0}
            stroke="transparent"
          >
            {chartData.map((item) => (
              <Cell
                key={item.key}
                fill={
                  hasData ? getHealthStatusColor(item.key) : DASHBOARD_EMPTY_RING_FILL
                }
              />
            ))}
          </Pie>
          {hasData && (
            <Tooltip
              content={<DashboardChartTooltip />}
              cursor={false}
              wrapperStyle={{ outline: 'none', zIndex: 50 }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground leading-none tabular-nums">
          {total}
        </span>
        <span className="text-xs text-muted-foreground mt-1">{centerLabel}</span>
      </div>
    </div>
  )
}
