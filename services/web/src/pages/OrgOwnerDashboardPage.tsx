import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderKanban,
  Rocket,
  Users,
  UserPlus,
  CreditCard,
  ShieldAlert,
  Plus,
  History,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { CardGridSkeleton, ContentFade } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStatCard } from '@/components/dashboard/kpi-stat-card'
import {
  HealthDonutChart,
  type StatusChartFilter,
} from '@/components/dashboard/health-donut-chart'
import { MemberManagementSnapshot } from '@/components/dashboard/member-management-snapshot'
import { ActivityPulseChart } from '@/components/dashboard/activity-pulse-chart'
import { ProjectHealthTable } from '@/components/dashboard/project-health-table'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'
import { InviteMemberDialog } from '@/components/team/invite-member-dialog'
import {
  useOrgDashboard,
  type DashboardRange,
} from '@/hooks/useOrgDashboard'

export function OrgOwnerDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [range] = useState<DashboardRange>('7d')
  const [statusFilter, setStatusFilter] = useState<StatusChartFilter>('all')
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showInviteMember, setShowInviteMember] = useState(false)
  const { data, isLoading, isError, refetch } = useOrgDashboard(range)

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('orgDashboard.title')}
        subtitle={t('orgDashboard.subtitle')}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button type="button" onClick={() => setShowCreateProject(true)}>
              <Plus className="h-4 w-4" />
              {t('projects.newProject')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInviteMember(true)}
            >
              <UserPlus className="h-4 w-4" />
              {t('orgDashboard.inviteMember')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/admin/audit-logs')}
            >
              <History className="h-4 w-4 mr-1.5" />
              {t('orgDashboard.viewAuditLogs')}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading && <CardGridSkeleton stats={6} cards={3} columns={3} />}

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
          <ContentFade>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiStatCard
                icon={<FolderKanban className="h-4 w-4" />}
                label={t('orgDashboard.kpi.totalProjects')}
                value={data.kpis.totalProjects}
                description={t('orgDashboard.kpi.totalProjectsHint')}
                iconClassName="bg-violet-500/15 text-violet-400"
              />
              <KpiStatCard
                icon={<Rocket className="h-4 w-4" />}
                label={t('orgDashboard.kpi.activeProjects')}
                value={data.kpis.activeProjects}
                description={t('orgDashboard.kpi.activeProjectsHint')}
                iconClassName="bg-sky-500/15 text-sky-400"
              />
              <KpiStatCard
                icon={<Users className="h-4 w-4" />}
                label={t('orgDashboard.kpi.totalMembers')}
                value={data.kpis.totalMembers}
                description={t('orgDashboard.kpi.totalMembersHint')}
                iconClassName="bg-emerald-500/15 text-emerald-400"
              />
              <KpiStatCard
                icon={<UserPlus className="h-4 w-4" />}
                label={t('orgDashboard.kpi.pendingInvites')}
                value={data.kpis.pendingInvites}
                description={t('orgDashboard.kpi.pendingInvitesHint')}
                iconClassName="bg-amber-500/15 text-amber-400"
              />
              <KpiStatCard
                icon={<CreditCard className="h-4 w-4" />}
                label={t('orgDashboard.kpi.billingStatus')}
                value={
                  data.kpis.billingStatus
                    ? data.kpis.billingStatus.charAt(0).toUpperCase() +
                      data.kpis.billingStatus.slice(1)
                    : '—'
                }
                description={
                  data.kpis.billingPlanName ?? t('orgDashboard.kpi.noPlan')
                }
                iconClassName="bg-teal-500/15 text-teal-400"
              />
              <KpiStatCard
                icon={<ShieldAlert className="h-4 w-4" />}
                label={t('orgDashboard.kpi.securityAlerts')}
                value={data.kpis.securityAlerts.count}
                description={t('orgDashboard.kpi.securityAlertsHint')}
                comingSoon={data.kpis.securityAlerts.comingSoon}
                iconClassName="bg-red-500/15 text-red-400"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4 items-stretch [&>*]:min-w-0 [&>*]:w-full">
              <MemberManagementSnapshot data={data.memberSnapshot} />
              <ActivityPulseChart
                title={t('orgDashboard.charts.recentActivity')}
                footerHref="/admin/audit-logs"
                footerLabel={t('orgDashboard.charts.viewAllActivity')}
                series={data.activity.series}
                recent={data.activity.recent}
              />
              <HealthDonutChart
                title={t('orgDashboard.charts.projectsByStatus')}
                centerLabel={t('orgDashboard.charts.total')}
                data={data.projectsByStatus}
                footerHref="/projects"
                footerLabel={t('orgDashboard.charts.viewAllProjects')}
                filterable
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            </div>

            <div className="mt-4">
              <ProjectHealthTable statusFilter={statusFilter} />
            </div>
          </ContentFade>
        )}
      </div>

      <CreateProjectDialog
        open={showCreateProject}
        onOpenChange={setShowCreateProject}
      />
      <InviteMemberDialog
        open={showInviteMember}
        onOpenChange={setShowInviteMember}
      />
    </div>
  )
}
