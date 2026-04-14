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
import type { AssigneeWorkloadData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface WorkloadChartProps {
  data: AssigneeWorkloadData
}

export function WorkloadChart({ data }: WorkloadChartProps) {
  const chartData = data.assignees.map((a) => ({
    name: a.displayName,
    openIssues: a.openIssues,
    closedIssues: a.issueCount - a.openIssues,
    storyPoints: a.totalStoryPoints,
  }))

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-foreground">
          Assignee Workload
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Issue distribution per team member
        </p>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
            No assigned issues
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
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
                  dataKey="openIssues"
                  name="Open Issues"
                  fill="#f59e0b"
                  stackId="issues"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="closedIssues"
                  name="Closed Issues"
                  fill="#22c55e"
                  stackId="issues"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Detailed table */}
        {data.assignees.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs">
                    Assignee
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-muted-foreground text-xs">
                    Open
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-muted-foreground text-xs">
                    Total
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-muted-foreground text-xs">
                    Story Points
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-muted-foreground text-xs">
                    Time Logged
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.assignees.map((a) => (
                  <tr key={a.assigneeId} className="border-b border-border">
                    <td className="py-2 px-3 font-medium text-foreground">
                      {a.displayName}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {a.openIssues}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {a.issueCount}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {a.totalStoryPoints}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {formatMinutes(a.totalTimeSpent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatMinutes(minutes: number): string {
  if (!minutes) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
