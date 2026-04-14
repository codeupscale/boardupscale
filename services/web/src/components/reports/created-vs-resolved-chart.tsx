import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { CreatedVsResolvedData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface CreatedVsResolvedChartProps {
  data: CreatedVsResolvedData
}

export function CreatedVsResolvedChart({ data }: CreatedVsResolvedChartProps) {
  const chartData = data.dates.map((date, i) => ({
    date: formatDateLabel(date, data.interval),
    created: data.created[i],
    resolved: data.resolved[i],
  }))

  const totalCreated = data.created.reduce((sum, c) => sum + c, 0)
  const totalResolved = data.resolved.reduce((sum, r) => sum + r, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Created vs Resolved
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Created: {totalCreated} | Resolved: {totalResolved} | Net:{' '}
              <span
                className={
                  totalCreated - totalResolved > 0
                    ? 'text-red-600'
                    : 'text-green-600'
                }
              >
                {totalCreated - totalResolved > 0 ? '+' : ''}
                {totalCreated - totalResolved}
              </span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
            No data for the selected period
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  label={{
                    value: 'Issues',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 12, fill: 'hsl(var(--muted-foreground))' },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid var(--tooltip-border)',
                    backgroundColor: 'var(--tooltip-bg)',
                    color: 'var(--tooltip-fg)',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="created"
                  name="Created"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="resolved"
                  name="Resolved"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatDateLabel(dateStr: string, interval: string): string {
  const d = new Date(dateStr)
  if (interval === 'week') {
    return `W${getWeekNumber(d)} ${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  const diff = d.getTime() - start.getTime()
  const oneWeek = 604800000
  return Math.ceil((diff / oneWeek) + 1)
}
