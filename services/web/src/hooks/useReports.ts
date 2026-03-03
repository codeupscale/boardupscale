import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// --- Types ---

export interface BurndownData {
  sprintName: string
  dates: string[]
  ideal: number[]
  actual: number[]
  totalPoints: number
}

export interface VelocitySprint {
  name: string
  committed: number
  completed: number
}

export interface VelocityData {
  sprints: VelocitySprint[]
  averageVelocity: number
}

export interface CumulativeFlowData {
  dates: string[]
  todo: number[]
  inProgress: number[]
  done: number[]
}

export interface BreakdownItem {
  name: string
  count: number
  color?: string
  category?: string
}

export interface IssueBreakdownData {
  byType: BreakdownItem[]
  byPriority: BreakdownItem[]
  byStatus: BreakdownItem[]
}

export interface AssigneeWorkloadItem {
  assigneeId: string
  displayName: string
  avatarUrl?: string
  issueCount: number
  openIssues: number
  totalStoryPoints: number
  totalTimeSpent: number
}

export interface AssigneeWorkloadData {
  assignees: AssigneeWorkloadItem[]
}

export interface CycleTimeByType {
  type: string
  average: number
  count: number
}

export interface CycleTimeDistribution {
  label: string
  count: number
}

export interface CycleTimeData {
  average: number
  byType: CycleTimeByType[]
  distribution: CycleTimeDistribution[]
}

export interface SprintReportSummary {
  totalIssues: number
  completedIssues: number
  incompleteIssues: number
  committedPoints: number
  completedPoints: number
  completionRate: number
  totalTimeEstimate: number
  totalTimeSpent: number
}

export interface SprintReportIssue {
  id: string
  key: string
  title: string
  type: string
  storyPoints?: number
  status?: { name: string; category: string }
  assignee?: { id: string; displayName: string }
}

export interface SprintReportData {
  sprint: {
    id: string
    name: string
    goal?: string
    status: string
    startDate?: string
    endDate?: string
  }
  summary: SprintReportSummary
  byType: Array<{ type: string; total: number; completed: number }>
  completedIssues: SprintReportIssue[]
  incompleteIssues: SprintReportIssue[]
}

// --- Hooks ---

export function useSprintBurndown(projectId: string, sprintId: string) {
  return useQuery({
    queryKey: ['reports', 'burndown', projectId, sprintId],
    queryFn: async () => {
      const { data } = await api.get(
        `/projects/${projectId}/reports/sprint-burndown`,
        { params: { sprintId } },
      )
      return data.data as BurndownData
    },
    enabled: !!projectId && !!sprintId,
  })
}

export function useVelocity(projectId: string, sprintCount: number = 6) {
  return useQuery({
    queryKey: ['reports', 'velocity', projectId, sprintCount],
    queryFn: async () => {
      const { data } = await api.get(
        `/projects/${projectId}/reports/velocity`,
        { params: { sprintCount } },
      )
      return data.data as VelocityData
    },
    enabled: !!projectId,
  })
}

export function useCumulativeFlow(
  projectId: string,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ['reports', 'cumulativeFlow', projectId, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const { data } = await api.get(
        `/projects/${projectId}/reports/cumulative-flow`,
        { params },
      )
      return data.data as CumulativeFlowData
    },
    enabled: !!projectId,
  })
}

export function useIssueBreakdown(projectId: string) {
  return useQuery({
    queryKey: ['reports', 'issueBreakdown', projectId],
    queryFn: async () => {
      const { data } = await api.get(
        `/projects/${projectId}/reports/issue-breakdown`,
      )
      return data.data as IssueBreakdownData
    },
    enabled: !!projectId,
  })
}

export function useAssigneeWorkload(projectId: string) {
  return useQuery({
    queryKey: ['reports', 'assigneeWorkload', projectId],
    queryFn: async () => {
      const { data } = await api.get(
        `/projects/${projectId}/reports/assignee-workload`,
      )
      return data.data as AssigneeWorkloadData
    },
    enabled: !!projectId,
  })
}

export function useCycleTime(
  projectId: string,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ['reports', 'cycleTime', projectId, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const { data } = await api.get(
        `/projects/${projectId}/reports/cycle-time`,
        { params },
      )
      return data.data as CycleTimeData
    },
    enabled: !!projectId,
  })
}

export function useSprintReport(projectId: string, sprintId: string) {
  return useQuery({
    queryKey: ['reports', 'sprintReport', projectId, sprintId],
    queryFn: async () => {
      const { data } = await api.get(
        `/projects/${projectId}/reports/sprint-report`,
        { params: { sprintId } },
      )
      return data.data as SprintReportData
    },
    enabled: !!projectId && !!sprintId,
  })
}
