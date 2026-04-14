import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3,
  Target,
  ArrowUpRight,
  FolderOpen,
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
import { PageHeader } from '@/components/common/page-header'
import { SprintIntelligenceWidget } from '@/components/dashboard/sprint-intelligence-widget'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

/* ── Stat Card ────────────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  color,
  accentBorder,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  accentBorder?: string
}) {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border p-5 relative overflow-hidden',
        'card-elevated plasma-card-hover cursor-default',
        accentBorder,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl font-bold text-foreground tracking-tight leading-none">{value}</p>
          <p className="text-sm text-muted-foreground mt-2">{label}</p>
        </div>
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', color)}>
          {icon}
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
    <div className="bg-card rounded-xl border border-border p-5 card-elevated plasma-card-hover transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{projectName}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{data.sprintName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{remaining}</p>
          <p className="text-xs text-muted-foreground">pts left</p>
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
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary dark:hover:text-primary mt-2 transition-colors"
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
    <div className="bg-card rounded-xl border border-border p-5 card-elevated plasma-card-hover transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{projectName}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">Velocity</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.averageVelocity}</p>
          <p className="text-xs text-muted-foreground">avg pts/sprint</p>
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
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary dark:hover:text-primary mt-2 transition-colors"
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
    <div className="bg-card rounded-xl border border-border p-5 card-elevated plasma-card-hover transition-all duration-200">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <p className="text-sm font-semibold text-foreground">My Workload</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">In Progress</span>
          <span className="text-sm font-semibold text-foreground bg-primary/10 px-2.5 py-0.5 rounded-full">
            {inProgressCount} issues
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Points</span>
          <span className="text-sm font-semibold text-foreground bg-purple-50 dark:bg-purple-900/20 px-2.5 py-0.5 rounded-full">
            {totalPoints} SP
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Time Logged</span>
          <span className="text-sm font-semibold text-foreground bg-amber-50 dark:bg-amber-900/20 px-2.5 py-0.5 rounded-full">
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
    <div className="flex flex-col h-full">
      <PageHeader
        title={`${greeting}, ${user?.displayName?.split(' ')[0] || 'there'}`}
        subtitle={t('dashboard.hereIsWhatsHappening', { date: formatDate(new Date()) })}
      />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            label={t('dashboard.openIssues')}
            value={stats.open}
            color="bg-amber-50 dark:bg-amber-900/20"
            accentBorder="stat-accent-amber"
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
            label={t('dashboard.inProgress')}
            value={stats.inProgress}
            color="bg-violet-50 dark:bg-violet-900/20"
            accentBorder="stat-accent-violet"
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
            label={t('dashboard.completedAllTime')}
            value={stats.done}
            color="bg-emerald-50 dark:bg-emerald-900/20"
            accentBorder="stat-accent-emerald"
          />
        </div>

        {/* Report Widgets */}
        {firstProject && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
                <BarChart3 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <h2 className="text-sm font-semibold text-foreground tracking-wide">Insights</h2>
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

            {/* Sprint Intelligence (AI) */}
            {activeSprint && (
              <SprintIntelligenceWidget sprintId={activeSprint.id} className="mt-0" />
            )}
          </>
        )}

        {/* My Issues */}
        <div className="bg-card rounded-xl border border-border overflow-hidden card-elevated">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{t('dashboard.myIssues')}</h2>
              {myIssues.length > 0 && (
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {myIssues.length}
                </span>
              )}
            </div>
            <Link
              to="/issues"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary dark:hover:text-primary transition-colors"
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
                  <tr className="border-b border-border bg-muted">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">Key</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.title')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">{t('common.priority')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36">{t('common.status')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">{t('common.assignee')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">{t('issues.dueDate')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">SP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20">
                <FolderOpen className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <h2 className="text-sm font-semibold text-foreground tracking-wide">{t('dashboard.recentProjects')}</h2>
            </div>
            <Link
              to="/projects"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary dark:hover:text-primary transition-colors"
            >
              {t('common.viewAll')}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {projectsLoading ? (
            <LoadingPage />
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.slice(0, 6).map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyState title={t('dashboard.noProjectsYet')} description={t('dashboard.createFirstProject')} />
          )}
        </div>
      </div>
    </div>
  )
}
