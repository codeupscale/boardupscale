import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { IssueBreakdownData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface IssueBreakdownChartsProps {
  data: IssueBreakdownData
}

const TYPE_COLORS: Record<string, string> = {
  epic: '#8b5cf6',
  story: '#3b82f6',
  task: '#22c55e',
  bug: '#ef4444',
  subtask: '#f59e0b',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  none: '#9ca3af',
}

const FALLBACK_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]

export function IssueBreakdownCharts({ data }: IssueBreakdownChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <BreakdownPie
        title="By Type"
        items={data.byType}
        colorMap={TYPE_COLORS}
      />
      <BreakdownPie
        title="By Priority"
        items={data.byPriority}
        colorMap={PRIORITY_COLORS}
      />
      <BreakdownPie
        title="By Status"
        items={data.byStatus.map((s) => ({
          name: s.name,
          count: s.count,
          color: s.color,
        }))}
        useItemColors
      />
    </div>
  )
}

function BreakdownPie({
  title,
  items,
  colorMap,
  useItemColors,
}: {
  title: string
  items: Array<{ name: string; count: number; color?: string }>
  colorMap?: Record<string, string>
  useItemColors?: boolean
}) {
  const total = items.reduce((sum, i) => sum + i.count, 0)

  const getColor = (item: { name: string; color?: string }, index: number) => {
    if (useItemColors && item.color) return item.color
    if (colorMap && colorMap[item.name]) return colorMap[item.name]
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{total} total issues</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-gray-500 text-sm">
            No data
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                  label={({ name, percent }) =>
                    `${capitalize(name)} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {items.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={getColor(item, index)}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  }}
                  formatter={(value: number) => [value, 'Issues']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}
