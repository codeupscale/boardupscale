import { Link } from 'react-router-dom'
import { CheckCircle, XCircle, Target, Clock } from 'lucide-react'
import type { SprintReportData } from '@/hooks/useReports'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface SprintReportProps {
  data: SprintReportData
}

export function SprintReport({ data }: SprintReportProps) {
  const { sprint, summary, byType, completedIssues, incompleteIssues } = data

  return (
    <div className="space-y-4">
      {/* Sprint info */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {sprint.name}
          </h3>
          {sprint.goal && (
            <p className="text-sm text-gray-500 mt-1">{sprint.goal}</p>
          )}
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            {sprint.startDate && <span>Started: {sprint.startDate}</span>}
            {sprint.endDate && <span>Ended: {sprint.endDate}</span>}
            <span className="capitalize">Status: {sprint.status}</span>
          </div>
        </CardHeader>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Completion Rate"
          value={`${summary.completionRate}%`}
          icon={<Target className="h-5 w-5 text-white" />}
          color="bg-blue-500"
        />
        <StatCard
          label="Completed Issues"
          value={`${summary.completedIssues} / ${summary.totalIssues}`}
          icon={<CheckCircle className="h-5 w-5 text-white" />}
          color="bg-green-500"
        />
        <StatCard
          label="Story Points"
          value={`${summary.completedPoints} / ${summary.committedPoints}`}
          icon={<Target className="h-5 w-5 text-white" />}
          color="bg-purple-500"
        />
        <StatCard
          label="Time Spent"
          value={formatMinutes(summary.totalTimeSpent)}
          icon={<Clock className="h-5 w-5 text-white" />}
          color="bg-orange-500"
        />
      </div>

      {/* By type */}
      {byType.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Breakdown by Type
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byType.map((t) => (
                <div key={t.type} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 w-20 capitalize">
                    {t.type}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{
                        width: `${t.total > 0 ? (t.completed / t.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-gray-500 w-16 text-right">
                    {t.completed}/{t.total}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed issues */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Completed Issues ({completedIssues.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {completedIssues.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No completed issues
            </p>
          ) : (
            <div className="space-y-1">
              {completedIssues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incomplete issues */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-yellow-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Incomplete Issues ({incompleteIssues.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {incompleteIssues.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              All issues completed!
            </p>
          ) : (
            <div className="space-y-1">
              {incompleteIssues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div
          className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function IssueRow({
  issue,
}: {
  issue: {
    id: string
    key: string
    title: string
    type: string
    storyPoints?: number
    status?: { name: string; category: string }
    assignee?: { id: string; displayName: string }
  }
}) {
  return (
    <Link
      to={`/issues/${issue.id}`}
      className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
    >
      <span className="text-xs font-mono text-gray-500 w-20">{issue.key}</span>
      <span className="text-sm text-gray-900 dark:text-gray-100 flex-1 truncate">
        {issue.title}
      </span>
      <span className="text-xs text-gray-500 capitalize">{issue.type}</span>
      {issue.storyPoints != null && (
        <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
          {issue.storyPoints} SP
        </span>
      )}
      {issue.assignee && (
        <span className="text-xs text-gray-500">{issue.assignee.displayName}</span>
      )}
      {issue.status && (
        <span className="text-xs text-gray-500">{issue.status.name}</span>
      )}
    </Link>
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
