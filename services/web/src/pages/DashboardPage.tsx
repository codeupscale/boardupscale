import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart3,
  Target,
  ArrowUpRight,
  Sparkles,
  FolderOpen,
  TrendingUp,
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
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth.store'
import { useIssues } from '@/hooks/useIssues'
import { useProjects } from '@/hooks/useProjects'
import { useVelocity, useSprintBurndown } from '@/hooks/useReports'
import { useSprints } from '@/hooks/useSprints'
import { IssueStatusCategory } from '@/types'
import { LoadingPage } from '@/components/ui/spinner'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { ProjectCard } from '@/components/projects/project-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SprintIntelligenceWidget } from '@/components/dashboard/sprint-intelligence-widget'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

/* ── Stat Card with gradient background ───────────────────────────── */

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  trend,
}: {
  label: string
  value: number
  icon: any
  gradient: string
  iconBg: string
  trend?: string
}) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl p-5 text-white shadow-lg',
      'transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5',
      gradient,
    )}>
      {/* Decorative circle */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-white/5" />

      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-3xl font-extrabold tracking-tight">{value}</p>
          <p className="mt-1 text-sm font-medium text-white/80">{label}</p>
          {trend && (
            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-white/70">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </div>
          )}
        </div>
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', iconBg)}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  )
}

/* ── Mini Burndown Widget ─────────────────────────────────────────── */

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
    date: date.slice(5),
    ideal: data.ideal[i],
    actual: data.actual[i] ?? null,
  }))

  const remaining = data.actual.length > 0 ? data.actual[data.actual.length - 1] : data.totalPoints

  return (
    <div className="group rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{projectName}</p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{data.sprintName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{remaining}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">pts left</p>
        </div>
      </div>
      <div className="h-24 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line
              type="monotone"
              dataKey="ideal"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                fontSize: 11,
                padding: '6px 10px',
                border: '1px solid var(--tooltip-border, #e5e7eb)',
                backgroundColor: 'var(--tooltip-bg, #fff)',
                color: 'var(--tooltip-fg, #111827)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Link
        to={`/projects/${projectId}/reports`}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 mt-2 transition-colors"
      >
        View full report
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  )
}

/* ── Velocity Widget ──────────────────────────────────────────────── */

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
    <div className="group rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{projectName}</p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">Velocity</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{data.averageVelocity}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">avg pts/sprint</p>
        </div>
      </div>
      <div className="h-24 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <Bar dataKey="completed" fill="url(#greenGradient)" radius={[6, 6, 0, 0]} />
            <defs>
              <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                fontSize: 11,
                padding: '6px 10px',
                border: '1px solid var(--tooltip-border, #e5e7eb)',
                backgroundColor: 'var(--tooltip-bg, #fff)',
                color: 'var(--tooltip-fg, #111827)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Link
        to={`/projects/${projectId}/reports`}
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 mt-2 transition-colors"
      >
        View full report
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  )
}

/* ── Workload Summary Widget ──────────────────────────────────────── */

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
    <div className="group rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">My Workload</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">In Progress</span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-0.5 rounded-full">
            {inProgressCount} issues
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">Total Points</span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-0.5 rounded-full">
            {totalPoints} SP
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">Time Logged</span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-0.5 rounded-full">
            {formatMinutes(totalTimeLogged)}
          </span>
        </div>
      </div>
    </div>
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

/* ── Main Dashboard ───────────────────────────────────────────────── */

export function DashboardPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { data: myIssuesData, isLoading: issuesLoading } = useIssues({
    assigneeId: user?.id,
    limit: 10,
  })
  const { data: projectsResult, isLoading: projectsLoading } = useProjects()
  const projects = projectsResult?.data

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
    if (hour < 12) return t('dashboard.goodMorning')
    if (hour < 17) return t('dashboard.goodAfternoon')
    return t('dashboard.goodEvening')
  }, [t])

  if (issuesLoading && projectsLoading) return <LoadingPage />

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Greeting Section */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            {greeting}, {user?.displayName?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1.5">
            {t('dashboard.hereIsWhatsHappening', { date: formatDate(new Date()) })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Your personal overview</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          label={t('dashboard.openIssues')}
          value={stats.open}
          icon={AlertCircle}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          iconBg="bg-white/20"
        />
        <StatCard
          label={t('dashboard.inProgress')}
          value={stats.inProgress}
          icon={Clock}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
          iconBg="bg-white/20"
        />
        <StatCard
          label={t('dashboard.completedAllTime')}
          value={stats.done}
          icon={CheckCircle}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
          iconBg="bg-white/20"
        />
      </div>

      {/* Report Widgets */}
      {firstProject && (
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <BarChart3 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Insights</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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

          {/* Sprint Intelligence (AI) */}
          {activeSprint && (
            <SprintIntelligenceWidget sprintId={activeSprint.id} className="mt-5" />
          )}
        </div>
      )}

      {/* My Issues */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t('dashboard.myIssues')}</h2>
            {myIssues.length > 0 && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                {myIssues.length}
              </span>
            )}
          </div>
          <Link
            to="/issues"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            {t('common.viewAll')}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {myIssues.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title={t('dashboard.noIssuesAssigned')}
              description={t('dashboard.issuesAssignedAppear')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/80">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Key</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('common.title')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">{t('common.priority')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-36">{t('common.status')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">{t('common.assignee')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">{t('issues.dueDate')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">SP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {myIssues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <FolderOpen className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.recentProjects')}</h2>
          </div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            {t('common.viewAll')}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {projectsLoading ? (
          <LoadingPage />
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {projects.slice(0, 4).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <EmptyState title={t('dashboard.noProjectsYet')} description={t('dashboard.createFirstProject')} />
        )}
      </div>
    </div>
  )
}
