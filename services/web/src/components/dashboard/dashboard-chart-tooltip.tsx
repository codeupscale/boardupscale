import {
  DASHBOARD_TOOLTIP_ITEM_STYLE,
  DASHBOARD_TOOLTIP_LABEL_STYLE,
  DASHBOARD_TOOLTIP_STYLE,
} from '@/components/dashboard/dashboard-chart-theme'

type TooltipPayloadItem = {
  name?: string
  value?: number
  payload?: { percent?: number }
}

interface DashboardChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  /** Extra suffix after the value, e.g. "activities" */
  valueSuffix?: string
  hideNames?: string[]
}

/** Shared Recharts custom tooltip — readable on dark cards. */
export function DashboardChartTooltip({
  active,
  payload,
  label,
  valueSuffix,
  hideNames = ['Empty'],
}: DashboardChartTooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  if (item.name && hideNames.includes(item.name)) return null

  const percent = item.payload?.percent
  const title = label ?? item.name
  const valueText = [
    item.value ?? 0,
    typeof percent === 'number' ? `(${percent}%)` : null,
    valueSuffix ?? null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div style={DASHBOARD_TOOLTIP_STYLE}>
      {title ? <div style={DASHBOARD_TOOLTIP_LABEL_STYLE}>{title}</div> : null}
      <div style={DASHBOARD_TOOLTIP_ITEM_STYLE}>{valueText}</div>
    </div>
  )
}
