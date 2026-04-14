import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { BurndownData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface BurndownChartProps {
  data: BurndownData
}

export function BurndownChart({ data }: BurndownChartProps) {
  const chartData = data.dates.map((date, i) => ({
    date: formatDateLabel(date),
    ideal: data.ideal[i],
    actual: data.actual[i] ?? null,
  }))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Sprint Burndown
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.sprintName} - {data.totalPoints} total points
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
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
                label={{
                  value: 'Story Points',
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
              <Line
                type="monotone"
                dataKey="ideal"
                name="Ideal"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
