import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { VelocityData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface VelocityChartProps {
  data: VelocityData
}

export function VelocityChart({ data }: VelocityChartProps) {
  const chartData = data.sprints.map((sprint) => ({
    name: sprint.name,
    committed: sprint.committed,
    completed: sprint.completed,
  }))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Velocity</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Average: {data.averageVelocity} story points per sprint
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
            No completed sprints yet
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'Story Points',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 12, fill: '#6b7280' },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="committed"
                  name="Committed"
                  fill="#93c5fd"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
                <ReferenceLine
                  y={data.averageVelocity}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{
                    value: `Avg: ${data.averageVelocity}`,
                    position: 'right',
                    fill: '#ef4444',
                    fontSize: 12,
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
