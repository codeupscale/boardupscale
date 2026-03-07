import { useState, useMemo } from 'react'
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
import { Tabs, TabContent } from '@/components/ui/tabs'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { useSprints } from '@/hooks/useSprints'
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

const TABS = [
  { id: 'burndown', label: 'Burndown', icon: <TrendingDown className="h-4 w-4" /> },
  { id: 'burnup', label: 'Burnup', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'velocity', label: 'Velocity', icon: <Zap className="h-4 w-4" /> },
  { id: 'created-vs-resolved', label: 'Created vs Resolved', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'cumulative-flow', label: 'Cumulative Flow', icon: <Layers className="h-4 w-4" /> },
  { id: 'breakdown', label: 'Breakdown', icon: <PieChartIcon className="h-4 w-4" /> },
  { id: 'workload', label: 'Workload', icon: <Users className="h-4 w-4" /> },
  { id: 'cycle-time', label: 'Cycle Time', icon: <Timer className="h-4 w-4" /> },
  { id: 'sprint-report', label: 'Sprint Report', icon: <FileText className="h-4 w-4" /> },
]

export function ProjectReportsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState('burndown')
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [cfdStartDate, setCfdStartDate] = useState('')
  const [cfdEndDate, setCfdEndDate] = useState('')
  const [ctStartDate, setCtStartDate] = useState('')
  const [ctEndDate, setCtEndDate] = useState('')
  const [cvrStartDate, setCvrStartDate] = useState('')
  const [cvrEndDate, setCvrEndDate] = useState('')
  const [cvrInterval, setCvrInterval] = useState<'day' | 'week'>('day')

  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectId || '')

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
    projectId || '',
    activeTab === 'burndown' ? activeSprint : '',
  )
  const velocityQuery = useVelocity(
    projectId || '',
    activeTab === 'velocity' ? 6 : 0,
  )
  const cfdQuery = useCumulativeFlow(
    projectId || '',
    activeTab === 'cumulative-flow' ? cfdStartDate || undefined : undefined,
    activeTab === 'cumulative-flow' ? cfdEndDate || undefined : undefined,
  )
  const breakdownQuery = useIssueBreakdown(
    activeTab === 'breakdown' ? projectId || '' : '',
  )
  const workloadQuery = useAssigneeWorkload(
    activeTab === 'workload' ? projectId || '' : '',
  )
  const cycleTimeQuery = useCycleTime(
    activeTab === 'cycle-time' ? projectId || '' : '',
    activeTab === 'cycle-time' ? ctStartDate || undefined : undefined,
    activeTab === 'cycle-time' ? ctEndDate || undefined : undefined,
  )
  const burnupQuery = useSprintBurnup(
    projectId || '',
    activeTab === 'burnup' ? activeSprint : '',
  )
  const createdVsResolvedQuery = useCreatedVsResolved(
    activeTab === 'created-vs-resolved' ? projectId || '' : '',
    activeTab === 'created-vs-resolved' ? cvrStartDate || undefined : undefined,
    activeTab === 'created-vs-resolved' ? cvrEndDate || undefined : undefined,
    activeTab === 'created-vs-resolved' ? cvrInterval : undefined,
  )
  const sprintReportQuery = useSprintReport(
    projectId || '',
    activeTab === 'sprint-report' ? activeSprint : '',
  )

  if (!projectId) return null

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Analytics and insights for your project
        </p>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <TabContent>
        {/* Sprint selector for burndown, burnup, and sprint report */}
        {(activeTab === 'burndown' || activeTab === 'burnup' || activeTab === 'sprint-report') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sprint
            </label>
            {sprintsLoading ? (
              <div className="text-sm text-gray-400">Loading sprints...</div>
            ) : sprints && sprints.length > 0 ? (
              <select
                value={activeSprint}
                onChange={(e) => setSelectedSprintId(e.target.value)}
                className="block w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name} ({sprint.status})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400">No sprints available</p>
            )}
          </div>
        )}

        {/* Date range for cumulative flow */}
        {activeTab === 'cumulative-flow' && (
          <div className="mb-4 flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={cfdStartDate}
                onChange={(e) => setCfdStartDate(e.target.value)}
                className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={cfdEndDate}
                onChange={(e) => setCfdEndDate(e.target.value)}
                className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Date range for cycle time */}
        {activeTab === 'cycle-time' && (
          <div className="mb-4 flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={ctStartDate}
                onChange={(e) => setCtStartDate(e.target.value)}
                className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={ctEndDate}
                onChange={(e) => setCtEndDate(e.target.value)}
                className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Date range and interval for created vs resolved */}
        {activeTab === 'created-vs-resolved' && (
          <div className="mb-4 flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={cvrStartDate}
                onChange={(e) => setCvrStartDate(e.target.value)}
                className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={cvrEndDate}
                onChange={(e) => setCvrEndDate(e.target.value)}
                className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interval
              </label>
              <select
                value={cvrInterval}
                onChange={(e) => setCvrInterval(e.target.value as 'day' | 'week')}
                className="block w-32 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
              </select>
            </div>
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'burndown' && (
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

        {activeTab === 'burnup' && (
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

        {activeTab === 'velocity' && (
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

        {activeTab === 'created-vs-resolved' && (
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

        {activeTab === 'cumulative-flow' && (
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

        {activeTab === 'breakdown' && (
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

        {activeTab === 'workload' && (
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

        {activeTab === 'cycle-time' && (
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

        {activeTab === 'sprint-report' && (
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
      </TabContent>
    </div>
  )
}
