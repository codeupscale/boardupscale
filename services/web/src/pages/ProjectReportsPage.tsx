import { ElementType, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  TrendingDown,
  TrendingUp,
  Zap,
  Layers,
  PieChart as PieChartIcon,
  Users,
  Timer,
  FileText,
  BarChart3,
} from 'lucide-react'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { useSprints } from '@/hooks/useSprints'
import { useProjects } from '@/hooks/useProjects'
import {
  useSprintBurndown,
  useSprintBurnup,
  useVelocity,
  useCumulativeFlow,
  useIssueBreakdown,
  useAssigneeWorkload,
  useCycleTime,
  useSprintReport,
  useCreatedVsResolved,
} from '@/hooks/useReports'
import { BurndownChart } from '@/components/reports/burndown-chart'
import { BurnupChart } from '@/components/reports/burnup-chart'
import { VelocityChart } from '@/components/reports/velocity-chart'
import { CumulativeFlowChart } from '@/components/reports/cumulative-flow-chart'
import { IssueBreakdownCharts } from '@/components/reports/issue-breakdown-charts'
import { WorkloadChart } from '@/components/reports/workload-chart'
import { CycleTimeChart } from '@/components/reports/cycle-time-chart'
import { SprintReport } from '@/components/reports/sprint-report'
import { CreatedVsResolvedChart } from '@/components/reports/created-vs-resolved-chart'
import { cn } from '@/lib/utils'

interface ReportItem {
  id: string
  label: string
  icon: ElementType
}

const REPORT_ITEMS: ReportItem[] = [
  { id: 'burndown', label: 'Burndown', icon: TrendingDown },
  { id: 'burnup', label: 'Burnup', icon: TrendingUp },
  { id: 'velocity', label: 'Velocity', icon: Zap },
  { id: 'created-vs-resolved', label: 'Created vs Resolved', icon: BarChart3 },
  { id: 'cumulative-flow', label: 'Cumulative Flow', icon: Layers },
  { id: 'breakdown', label: 'Breakdown', icon: PieChartIcon },
  { id: 'workload', label: 'Workload', icon: Users },
  { id: 'cycle-time', label: 'Cycle Time', icon: Timer },
  { id: 'sprint-report', label: 'Sprint Report', icon: FileText },
]

export function ProjectReportsPage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const [activeReport, setActiveReport] = useState('burndown')
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [cfdStartDate, setCfdStartDate] = useState('')
  const [cfdEndDate, setCfdEndDate] = useState('')
  const [ctStartDate, setCtStartDate] = useState('')
  const [ctEndDate, setCtEndDate] = useState('')
  const [cvrStartDate, setCvrStartDate] = useState('')
  const [cvrEndDate, setCvrEndDate] = useState('')
  const [cvrInterval, setCvrInterval] = useState<'day' | 'week'>('day')

  const { data: projectsResult } = useProjects()
  const project = projectsResult?.data?.find((p) => p.key === projectKey)

  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectKey || '')

  // Auto-select first sprint
  const activeSprint = useMemo(() => {
    if (selectedSprintId) return selectedSprintId
    if (!sprints || sprints.length === 0) return ''
    // Prefer active sprint, then most recent
    const active = sprints.find((s) => s.status === 'active')
    return active?.id || sprints[0]?.id || ''
  }, [sprints, selectedSprintId])

  // Data hooks
  const burndownQuery = useSprintBurndown(
    projectKey || '',
    activeReport === 'burndown' ? activeSprint : '',
  )
  const velocityQuery = useVelocity(
    projectKey || '',
    activeReport === 'velocity' ? 6 : 0,
  )
  const cfdQuery = useCumulativeFlow(
    projectKey || '',
    activeReport === 'cumulative-flow' ? cfdStartDate || undefined : undefined,
    activeReport === 'cumulative-flow' ? cfdEndDate || undefined : undefined,
  )
  const breakdownQuery = useIssueBreakdown(
    activeReport === 'breakdown' ? projectKey || '' : '',
  )
  const workloadQuery = useAssigneeWorkload(
    activeReport === 'workload' ? projectKey || '' : '',
  )
  const cycleTimeQuery = useCycleTime(
    activeReport === 'cycle-time' ? projectKey || '' : '',
    activeReport === 'cycle-time' ? ctStartDate || undefined : undefined,
    activeReport === 'cycle-time' ? ctEndDate || undefined : undefined,
  )
  const burnupQuery = useSprintBurnup(
    projectKey || '',
    activeReport === 'burnup' ? activeSprint : '',
  )
  const createdVsResolvedQuery = useCreatedVsResolved(
    activeReport === 'created-vs-resolved' ? projectKey || '' : '',
    activeReport === 'created-vs-resolved' ? cvrStartDate || undefined : undefined,
    activeReport === 'created-vs-resolved' ? cvrEndDate || undefined : undefined,
    activeReport === 'created-vs-resolved' ? cvrInterval : undefined,
  )
  const sprintReportQuery = useSprintReport(
    projectKey || '',
    activeReport === 'sprint-report' ? activeSprint : '',
  )

  if (!projectKey) return null

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project?.name ?? 'Reports'}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name ?? '...', href: `/projects/${projectKey}/board` },
          { label: 'Reports' },
        ]}
      />
      <ProjectTabNav projectKey={projectKey} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — report list */}
        <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 pt-4 pb-2">
            Reports
          </p>
          {REPORT_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveReport(item.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm transition-colors text-left w-full',
                activeReport === item.id
                  ? 'bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70',
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Right panel — chart */}
        <div className="flex-1 overflow-auto p-6">
          {/* Controls row */}
          <div className="flex items-end gap-4 mb-6">
            {/* Sprint selector for burndown, burnup, and sprint report */}
            {(activeReport === 'burndown' || activeReport === 'burnup' || activeReport === 'sprint-report') && (
              <div className="w-64">
                {sprintsLoading ? (
                  <div className="text-sm text-gray-500">Loading sprints...</div>
                ) : sprints && sprints.length > 0 ? (
                  <Select
                    label="Sprint"
                    value={activeSprint}
                    onChange={(e) => setSelectedSprintId(e.target.value)}
                    options={sprints.map((s) => ({ value: s.id, label: `${s.name} (${s.status})` }))}
                    className="w-64"
                  />
                ) : (
                  <p className="text-sm text-gray-500">No sprints available</p>
                )}
              </div>
            )}

            {/* Date range for cumulative flow */}
            {activeReport === 'cumulative-flow' && (
              <>
                <DatePicker
                  label="Start Date"
                  value={cfdStartDate || undefined}
                  onChange={(d) => setCfdStartDate(d ?? '')}
                  placeholder="Start date"
                />
                <DatePicker
                  label="End Date"
                  value={cfdEndDate || undefined}
                  onChange={(d) => setCfdEndDate(d ?? '')}
                  placeholder="End date"
                />
              </>
            )}

            {/* Date range for cycle time */}
            {activeReport === 'cycle-time' && (
              <>
                <DatePicker
                  label="Start Date"
                  value={ctStartDate || undefined}
                  onChange={(d) => setCtStartDate(d ?? '')}
                  placeholder="Start date"
                />
                <DatePicker
                  label="End Date"
                  value={ctEndDate || undefined}
                  onChange={(d) => setCtEndDate(d ?? '')}
                  placeholder="End date"
                />
              </>
            )}

            {/* Date range and interval for created vs resolved */}
            {activeReport === 'created-vs-resolved' && (
              <>
                <DatePicker
                  label="Start Date"
                  value={cvrStartDate || undefined}
                  onChange={(d) => setCvrStartDate(d ?? '')}
                  placeholder="Start date"
                />
                <DatePicker
                  label="End Date"
                  value={cvrEndDate || undefined}
                  onChange={(d) => setCvrEndDate(d ?? '')}
                  placeholder="End date"
                />
                <div className="w-32">
                  <Select
                    label="Interval"
                    value={cvrInterval}
                    onChange={(e) => setCvrInterval(e.target.value as 'day' | 'week')}
                    options={[
                      { value: 'day', label: 'Daily' },
                      { value: 'week', label: 'Weekly' },
                    ]}
                  />
                </div>
              </>
            )}
          </div>

          {/* Chart content */}
          {activeReport === 'burndown' && (
            <>
              {!activeSprint ? (
                <EmptyState
                  title="No sprint selected"
                  description="Select a sprint to view the burndown chart."
                />
              ) : burndownQuery.isLoading ? (
                <LoadingPage />
              ) : burndownQuery.data ? (
                <BurndownChart data={burndownQuery.data} />
              ) : (
                <EmptyState
                  title="No burndown data"
                  description="Start a sprint to track burndown."
                />
              )}
            </>
          )}

          {activeReport === 'burnup' && (
            <>
              {!activeSprint ? (
                <EmptyState
                  title="No sprint selected"
                  description="Select a sprint to view the burnup chart."
                />
              ) : burnupQuery.isLoading ? (
                <LoadingPage />
              ) : burnupQuery.data ? (
                <BurnupChart data={burnupQuery.data} />
              ) : (
                <EmptyState
                  title="No burnup data"
                  description="Start a sprint to track burnup."
                />
              )}
            </>
          )}

          {activeReport === 'velocity' && (
            <>
              {velocityQuery.isLoading ? (
                <LoadingPage />
              ) : velocityQuery.data ? (
                <VelocityChart data={velocityQuery.data} />
              ) : (
                <EmptyState
                  title="No velocity data"
                  description="Complete sprints to track velocity."
                />
              )}
            </>
          )}

          {activeReport === 'created-vs-resolved' && (
            <>
              {createdVsResolvedQuery.isLoading ? (
                <LoadingPage />
              ) : createdVsResolvedQuery.data ? (
                <CreatedVsResolvedChart data={createdVsResolvedQuery.data} />
              ) : (
                <EmptyState
                  title="No data"
                  description="Create and resolve issues to see the chart."
                />
              )}
            </>
          )}

          {activeReport === 'cumulative-flow' && (
            <>
              {cfdQuery.isLoading ? (
                <LoadingPage />
              ) : cfdQuery.data ? (
                <CumulativeFlowChart data={cfdQuery.data} />
              ) : (
                <EmptyState
                  title="No flow data"
                  description="Create issues to see cumulative flow."
                />
              )}
            </>
          )}

          {activeReport === 'breakdown' && (
            <>
              {breakdownQuery.isLoading ? (
                <LoadingPage />
              ) : breakdownQuery.data ? (
                <IssueBreakdownCharts data={breakdownQuery.data} />
              ) : (
                <EmptyState
                  title="No breakdown data"
                  description="Create issues to see breakdowns."
                />
              )}
            </>
          )}

          {activeReport === 'workload' && (
            <>
              {workloadQuery.isLoading ? (
                <LoadingPage />
              ) : workloadQuery.data ? (
                <WorkloadChart data={workloadQuery.data} />
              ) : (
                <EmptyState
                  title="No workload data"
                  description="Assign issues to team members to see workload."
                />
              )}
            </>
          )}

          {activeReport === 'cycle-time' && (
            <>
              {cycleTimeQuery.isLoading ? (
                <LoadingPage />
              ) : cycleTimeQuery.data ? (
                <CycleTimeChart data={cycleTimeQuery.data} />
              ) : (
                <EmptyState
                  title="No cycle time data"
                  description="Complete issues to track cycle time."
                />
              )}
            </>
          )}

          {activeReport === 'sprint-report' && (
            <>
              {!activeSprint ? (
                <EmptyState
                  title="No sprint selected"
                  description="Select a sprint to view the report."
                />
              ) : sprintReportQuery.isLoading ? (
                <LoadingPage />
              ) : sprintReportQuery.data ? (
                <SprintReport data={sprintReportQuery.data} />
              ) : (
                <EmptyState
                  title="No sprint data"
                  description="Select a sprint to view its report."
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
