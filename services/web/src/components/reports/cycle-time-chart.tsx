import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { CycleTimeData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface CycleTimeChartProps {
  data: CycleTimeData
}

const TYPE_COLORS: Record<string, string> = {
  epic: '#8b5cf6',
  story: '#3b82f6',
  task: '#22c55e',
  bug: '#ef4444',
  subtask: '#f59e0b',
}

export function CycleTimeChart({ data }: CycleTimeChartProps) {
  return (
    <div className="space-y-4">
      {/* Distribution chart */}
      <Card>
        <CardHeader>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Cycle Time Distribution
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Average cycle time: {data.average} days
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
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
                  formatter={(value: number) => [value, 'Issues']}
                />
                <Bar
                  dataKey="count"
                  name="Issues"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* By type breakdown */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-foreground">
            Cycle Time by Issue Type
          </h3>
        </CardHeader>
        <CardContent>
          {data.byType.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No completed issues to analyze
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="type"
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    tickFormatter={capitalize}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: 'Avg Days',
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
                    formatter={(value: number, _name: string, props: any) => [
                      `${value} days (${props.payload.count} issues)`,
                      'Avg Cycle Time',
                    ]}
                    labelFormatter={capitalize}
                  />
                  <Bar dataKey="average" name="Avg Days" radius={[4, 4, 0, 0]}>
                    {data.byType.map((entry) => (
                      <Cell
                        key={entry.type}
                        fill={TYPE_COLORS[entry.type] || '#3b82f6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}
