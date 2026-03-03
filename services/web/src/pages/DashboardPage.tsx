import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Zap,
  Target,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuthStore } from '@/store/auth.store'
import { useIssues } from '@/hooks/useIssues'
import { useProjects } from '@/hooks/useProjects'
import { useVelocity, useSprintBurndown } from '@/hooks/useReports'
import { useSprints } from '@/hooks/useSprints'
import { IssueStatusCategory } from '@/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LoadingPage } from '@/components/ui/spinner'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { ProjectCard } from '@/components/projects/project-card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: any
  color: string
}) {
  return (
    <Card className="flex-1">
      <CardContent className="flex items-center gap-4 py-5">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function MiniBurndownWidget({
  projectId,
  projectName,
  sprintId,
}: {
  projectId: string
  projectName: string
  sprintId: string
}) {
  const { data, isLoading } = useSprintBurndown(projectId, sprintId)

  if (isLoading || !data) return null

  const chartData = data.dates.map((date, i) => ({
    date: date.slice(5), // MM-DD
    ideal: data.ideal[i],
    actual: data.actual[i] ?? null,
  }))

  const remaining = data.actual.length > 0 ? data.actual[data.actual.length - 1] : data.totalPoints

  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-gray-400 truncate">{projectName}</p>
            <p className="text-sm font-semibold text-gray-900">{data.sprintName}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-blue-600">{remaining}</p>
            <p className="text-xs text-gray-400">pts remaining</p>
          </div>
        </div>
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="ideal"
                stroke="#cbd5e1"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 6,
                  fontSize: 11,
                  padding: '4px 8px',
                  border: '1px solid #e5e7eb',
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Link
          to={`/projects/${projectId}/reports`}
          className="text-xs text-blue-600 hover:text-blue-700 mt-1 inline-block"
        >
          View full report
        </Link>
      </CardContent>
    </Card>
  )
}

function VelocityWidget({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const { data, isLoading } = useVelocity(projectId, 4)

  if (isLoading || !data || data.sprints.length === 0) return null

  const chartData = data.sprints.map((s) => ({
    name: s.name.length > 8 ? s.name.slice(0, 8) + '...' : s.name,
    completed: s.completed,
  }))

  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-gray-400 truncate">{projectName}</p>
            <p className="text-sm font-semibold text-gray-900">Velocity</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-green-600">{data.averageVelocity}</p>
            <p className="text-xs text-gray-400">avg pts/sprint</p>
          </div>
        </div>
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <Bar dataKey="completed" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Tooltip
                contentStyle={{
                  borderRadius: 6,
                  fontSize: 11,
                  padding: '4px 8px',
                  border: '1px solid #e5e7eb',
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Link
          to={`/projects/${projectId}/reports`}
          className="text-xs text-blue-600 hover:text-blue-700 mt-1 inline-block"
        >
          View full report
        </Link>
      </CardContent>
    </Card>
  )
}

function WorkloadSummaryWidget({
  myIssues,
}: {
  myIssues: Array<{
    status?: { category: string }
    storyPoints?: number
    timeSpent: number
  }>
}) {
  const totalPoints = myIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)
  const totalTimeLogged = myIssues.reduce((sum, i) => sum + (i.timeSpent || 0), 0)
  const inProgressCount = myIssues.filter(
    (i) => i.status?.category === IssueStatusCategory.IN_PROGRESS,
  ).length

  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-purple-500" />
          <p className="text-sm font-semibold text-gray-900">My Workload</p>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">In Progress</span>
            <span className="font-medium text-gray-900">{inProgressCount} issues</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total Points</span>
            <span className="font-medium text-gray-900">{totalPoints} SP</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Time Logged</span>
            <span className="font-medium text-gray-900">{formatMinutes(totalTimeLogged)}</span>
          </div>
        </div>
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

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data: myIssuesData, isLoading: issuesLoading } = useIssues({
    assigneeId: user?.id,
    limit: 10,
  })
  const { data: projects, isLoading: projectsLoading } = useProjects()

  const myIssues = myIssuesData?.data || []

  // Find first project with an active sprint for the mini burndown
  const firstProject = projects && projects.length > 0 ? projects[0] : null
  const { data: sprints } = useSprints(firstProject?.id || '')
  const activeSprint = useMemo(() => {
    if (!sprints) return null
    return sprints.find((s) => s.status === 'active') || null
  }, [sprints])

  const stats = useMemo(() => {
    const open = myIssues.filter(
      (i) => i.status?.category === IssueStatusCategory.TODO,
    ).length
    const inProgress = myIssues.filter(
      (i) => i.status?.category === IssueStatusCategory.IN_PROGRESS,
    ).length
    const done = myIssues.filter(
      (i) => i.status?.category === IssueStatusCategory.DONE,
    ).length
    return { open, inProgress, done }
  }, [myIssues])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  if (issuesLoading && projectsLoading) return <LoadingPage />

  return (
    <div className="p-6 space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {user?.displayName?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {formatDate(new Date())} — Here's what's happening today.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <StatCard
          label="Open Issues"
          value={stats.open}
          icon={AlertCircle}
          color="bg-yellow-500"
        />
        <StatCard
          label="In Progress"
          value={stats.inProgress}
          icon={Clock}
          color="bg-blue-500"
        />
        <StatCard
          label="Completed (All Time)"
          value={stats.done}
          icon={CheckCircle}
          color="bg-green-500"
        />
      </div>

      {/* Report Widgets */}
      {firstProject && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Insights</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeSprint && (
              <MiniBurndownWidget
                projectId={firstProject.id}
                projectName={firstProject.name}
                sprintId={activeSprint.id}
              />
            )}
            <VelocityWidget
              projectId={firstProject.id}
              projectName={firstProject.name}
            />
            <WorkloadSummaryWidget myIssues={myIssues} />
          </div>
        </div>
      )}

      {/* My Issues */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">My Issues</h2>
            <Link to="/issues" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
        </CardHeader>
        {myIssues.length === 0 ? (
          <EmptyState
            title="No issues assigned to you"
            description="Issues assigned to you will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-32">Key</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-28">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-36">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-16">Assignee</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-28">Due Date</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-16">SP</th>
                </tr>
              </thead>
              <tbody>
                {myIssues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Projects</h2>
          <Link to="/projects" className="text-sm text-blue-600 hover:text-blue-700">
            View all
          </Link>
        </div>
        {projectsLoading ? (
          <LoadingPage />
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {projects.slice(0, 4).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <EmptyState title="No projects yet" description="Create your first project to get started." />
        )}
      </div>
    </div>
  )
}
