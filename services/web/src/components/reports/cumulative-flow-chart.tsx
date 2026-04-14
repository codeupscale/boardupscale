import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { CumulativeFlowData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface CumulativeFlowChartProps {
  data: CumulativeFlowData
}

export function CumulativeFlowChart({ data }: CumulativeFlowChartProps) {
  const chartData = data.dates.map((date, i) => ({
    date: formatDateLabel(date),
    todo: data.todo[i],
    inProgress: data.inProgress[i],
    done: data.done[i],
  }))

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-foreground">
          Cumulative Flow Diagram
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Issue distribution over time
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
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
              <Area
                type="monotone"
                dataKey="done"
                name="Done"
                stackId="1"
                fill="#22c55e"
                stroke="#16a34a"
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="inProgress"
                name="In Progress"
                stackId="1"
                fill="#3b82f6"
                stroke="#2563eb"
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="todo"
                name="To Do"
                stackId="1"
                fill="#94a3b8"
                stroke="#64748b"
                fillOpacity={0.6}
              />
            </AreaChart>
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
