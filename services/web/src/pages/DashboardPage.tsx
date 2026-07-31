import { useMemo, useState } from 'react'
import { FolderKanban, Rocket, AlertCircle, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader } from '@/components/common/page-header'
import { CardGridSkeleton, ContentFade } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStatCard } from '@/components/dashboard/kpi-stat-card'
import { IssueStatusDonutChart } from '@/components/dashboard/issue-status-donut-chart'
import { ActiveSprintOverview } from '@/components/dashboard/active-sprint-overview'
import { TeamWorkload } from '@/components/dashboard/team-workload'
import { ProjectHealthTable } from '@/components/dashboard/project-health-table'
import { RecentProjectActivity } from '@/components/dashboard/recent-project-activity'
import { SprintIntelligenceWidget } from '@/components/dashboard/sprint-intelligence-widget'
import { useMemberDashboard, useMemberScopedProjects } from '@/hooks/useMemberDashboard'
import { formatDate } from '@/lib/utils'

/** Shared row count for "My Projects Overview" and "Recent Project Activity" —
 *  keeping both on the same value is what keeps their card heights matched. */
const MEMBER_DASHBOARD_ROW_COUNT = 8

export function DashboardPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [issueStatusProjectId, setIssueStatusProjectId] = useState<string | undefined>(undefined)
  const [activeSprintProjectId, setActiveSprintProjectId] = useState<string | undefined>(undefined)
  const [teamWorkloadProjectId, setTeamWorkloadProjectId] = useState<string | undefined>(undefined)
  const [recentActivityProjectId, setRecentActivityProjectId] = useState<string | undefined>(undefined)
  const { data, isLoading, isFetching, isError, refetch } = useMemberDashboard('7d', {
    issueStatusProjectId,
    activeSprintProjectId,
    teamWorkloadProjectId,
    recentActivityProjectId,
  })
  const {
    data: scopedProjects,
    isLoading: isProjectsLoading,
    isError: isProjectsError,
    refetch: refetchProjects,
  } = useMemberScopedProjects()
  const isRefreshing = isFetching && !isLoading

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return t('dashboard.goodMorning')
    if (hour < 17) return t('dashboard.goodAfternoon')
    return t('dashboard.goodEvening')
  }, [t])

  const firstActiveSprint = data?.activeSprints[0] ?? null

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`${greeting}, ${user?.displayName?.split(' ')[0] || 'there'}`}
        subtitle={t('dashboard.hereIsWhatsHappening', { date: formatDate(new Date()) })}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading && <CardGridSkeleton stats={4} cards={3} columns={3} />}

        {isError && (
          <EmptyState
            title={t('orgDashboard.loadError')}
            description={t('orgDashboard.loadErrorHint')}
            action={{
              label: t('orgDashboard.retry'),
              onClick: () => {
                void refetch()
              },
            }}
          />
        )}

        {!isLoading && !isError && data && (
          <ContentFade className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiStatCard
                icon={<FolderKanban className="h-4 w-4" />}
                label="Total Projects"
                value={data.kpis.totalProjects}
                description="Created by you"
                iconClassName="bg-violet-500/15 text-violet-400"
              />
              <KpiStatCard
                icon={<Rocket className="h-4 w-4" />}
                label="Active Projects"
                value={data.kpis.activeProjects}
                description="Created/Added by you"
                iconClassName="bg-sky-500/15 text-sky-400"
              />
              <KpiStatCard
                icon={<Clock className="h-4 w-4" />}
                label="Open Issues"
                value={data.kpis.openIssues}
                description="In your projects"
                iconClassName="bg-amber-500/15 text-amber-400"
              />
              <KpiStatCard
                icon={<AlertCircle className="h-4 w-4" />}
                label="Overdue Issues"
                value={data.kpis.overdueIssues}
                description="In your projects"
                iconClassName="bg-red-500/15 text-red-400"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-10 gap-3 items-stretch [&>*]:min-w-0 [&>*]:w-full">
              <div className="lg:col-span-3">
                <IssueStatusDonutChart
                  title="Open Issues by Status"
                  centerLabel="Total Issues"
                  data={data.issueStatus}
                  footerHref="/issues"
                  footerLabel="View all issues"
                  className="h-full"
                  projects={scopedProjects}
                  selectedProjectId={issueStatusProjectId}
                  onProjectChange={setIssueStatusProjectId}
                  isProjectsLoading={isProjectsLoading}
                  isProjectsError={isProjectsError}
                  onRetryProjects={() => void refetchProjects()}
                  isRefreshing={isRefreshing}
                />
              </div>
              <div className="lg:col-span-3">
                <ActiveSprintOverview
                  sprints={data.activeSprints}
                  projects={scopedProjects}
                  selectedProjectId={activeSprintProjectId}
                  onProjectChange={setActiveSprintProjectId}
                  isProjectsLoading={isProjectsLoading}
                  isProjectsError={isProjectsError}
                  onRetryProjects={() => void refetchProjects()}
                  isRefreshing={isRefreshing}
                />
              </div>
              <div className="lg:col-span-4">
                <TeamWorkload
                  data={data.teamWorkload}
                  projects={scopedProjects}
                  selectedProjectId={teamWorkloadProjectId}
                  onProjectChange={setTeamWorkloadProjectId}
                  isProjectsLoading={isProjectsLoading}
                  isProjectsError={isProjectsError}
                  onRetryProjects={() => void refetchProjects()}
                  isRefreshing={isRefreshing}
                />
              </div>
            </div>

            {firstActiveSprint && (
              <SprintIntelligenceWidget sprintId={firstActiveSprint.sprintId} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-10 gap-3 items-stretch [&>*]:min-w-0 [&>*]:w-full">
              <div className="lg:col-span-6">
                <ProjectHealthTable
                  scope="member"
                  title="My Projects Overview"
                  viewportRows={MEMBER_DASHBOARD_ROW_COUNT}
                />
              </div>
              <div className="lg:col-span-4">
                <RecentProjectActivity
                  recent={data.activity.recent}
                  rowCount={MEMBER_DASHBOARD_ROW_COUNT}
                  projects={scopedProjects}
                  selectedProjectId={recentActivityProjectId}
                  onProjectChange={setRecentActivityProjectId}
                  isProjectsLoading={isProjectsLoading}
                  isProjectsError={isProjectsError}
                  onRetryProjects={() => void refetchProjects()}
                  isRefreshing={isRefreshing}
                />
              </div>
            </div>
          </ContentFade>
        )}
      </div>
    </div>
  )
}
