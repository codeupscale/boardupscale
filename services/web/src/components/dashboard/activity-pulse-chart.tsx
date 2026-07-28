import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Avatar } from '@/components/ui/avatar'
import { formatRelativeTime } from '@/lib/utils'
import type { ActivityFeedItem, ActivitySeriesPoint } from '@/hooks/useOrgDashboard'
import { DashboardPanelCard } from '@/components/dashboard/dashboard-panel-card'
import { DashboardChartTooltip } from '@/components/dashboard/dashboard-chart-tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DASHBOARD_ACCENT,
  DASHBOARD_PANEL,
} from '@/components/dashboard/dashboard-chart-theme'
import type { DashboardRange } from '@/hooks/useOrgDashboard'

interface ActivityPulseChartProps {
  series: ActivitySeriesPoint[]
  recent: ActivityFeedItem[]
  range?: DashboardRange
  onRangeChange?: (next: DashboardRange) => void
  rangeLabel?: string
  range7dLabel?: string
  range30dLabel?: string
  title?: string
  footerHref?: string
  footerLabel?: string
  className?: string
}

function actionLabel(action: string): string {
  switch (action) {
    case 'created':
      return 'created'
    case 'assigned':
      return 'assigned'
    case 'commented':
      return 'commented on'
    case 'status_changed':
      return 'updated status of'
    case 'updated':
      return 'updated'
    default:
      return action.replace(/_/g, ' ')
  }
}

export function ActivityPulseChart({
  series,
  recent,
  range = '7d',
  onRangeChange,
  rangeLabel = 'Date range',
  range7dLabel = '7 days',
  range30dLabel = '30 days',
  title = 'Recent Organization Activity',
  footerHref = '/admin/audit-logs',
  footerLabel = 'View All Activity',
  className,
}: ActivityPulseChartProps) {
  const chartData = series.map((p) => ({
    ...p,
    label: p.date.slice(5),
  }))
  const feedSlots = DASHBOARD_PANEL.activityFeedSlots
  const feed = recent.slice(0, feedSlots)
  const emptySlots = Math.max(0, feedSlots - feed.length)
  const hasSeries = series.some((p) => p.count > 0)
  const headerExtra = onRangeChange ? (
    <Select
      value={range}
      onValueChange={(value) => onRangeChange(value as DashboardRange)}
    >
      <SelectTrigger
        className="h-8 w-[120px] text-xs border-border/80 bg-background/60"
        aria-label={rangeLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7d" className="text-xs">
          {range7dLabel}
        </SelectItem>
        <SelectItem value="30d" className="text-xs">
          {range30dLabel}
        </SelectItem>
      </SelectContent>
    </Select>
  ) : null

  return (
    <DashboardPanelCard
      title={title}
      headerExtra={headerExtra}
      footerHref={footerHref}
      footerLabel={footerLabel}
      className={className}
    >
      <div
        className="w-full flex-shrink-0"
        style={{ height: DASHBOARD_PANEL.activityChartHeightPx }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="orgActivityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={DASHBOARD_ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={DASHBOARD_ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(139,92,246,0.12)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              width={24}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<DashboardChartTooltip valueSuffix="activities" />}
              cursor={{ stroke: DASHBOARD_ACCENT, strokeOpacity: 0.35 }}
              wrapperStyle={{ outline: 'none', zIndex: 50 }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={DASHBOARD_ACCENT}
              strokeWidth={2}
              fill="url(#orgActivityFill)"
              dot={false}
              activeDot={{
                r: 4,
                fill: DASHBOARD_ACCENT,
                stroke: '#12121a',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {!hasSeries && feed.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No activity in this period yet
        </p>
      )}

      <ul className="flex-1 space-y-2 min-h-0">
        {feed.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-xs">
            <Avatar
              src={item.userAvatarUrl ?? undefined}
              name={item.userDisplayName ?? 'User'}
              size="xs"
            />
            <div className="min-w-0 flex-1">
              <p className="text-foreground leading-snug line-clamp-2">
                <span className="font-medium">
                  {item.userDisplayName ?? 'Someone'}
                </span>{' '}
                <span className="text-muted-foreground">{actionLabel(item.action)}</span>{' '}
                <span className="font-medium text-violet-300">
                  {item.issueKey ? item.issueKey : item.target}
                </span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatRelativeTime(item.createdAt)}
              </p>
            </div>
          </li>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <li
            key={`empty-${i}`}
            className="rounded-md border border-dashed border-border/50 bg-muted/10"
            style={{ minHeight: DASHBOARD_PANEL.activityFeedSlotMinHeightPx }}
            aria-hidden
          />
        ))}
      </ul>
    </DashboardPanelCard>
  )
}
