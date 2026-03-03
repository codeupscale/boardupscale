import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Clock, AlertCircle, TrendingUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useIssues } from '@/hooks/useIssues'
import { useProjects } from '@/hooks/useProjects'
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

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data: myIssuesData, isLoading: issuesLoading } = useIssues({
    assigneeId: user?.id,
    limit: 10,
  })
  const { data: projects, isLoading: projectsLoading } = useProjects()

  const myIssues = myIssuesData?.data || []

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
