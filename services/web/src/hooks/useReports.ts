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

export interface BurnupData {
  sprintName: string
  dates: string[]
  scopeData: number[]
  completedData: number[]
  totalPoints: number
}

export interface CreatedVsResolvedData {
  dates: string[]
  created: number[]
  resolved: number[]
  interval: string
}

export interface TimesheetEntry {
  workLogId: string
  issueId: string
  issueKey: string
  issueTitle: string
  projectName: string
  timeSpent: number
  description: string
  loggedAt: string
}

export interface TimesheetDay {
  date: string
  entries: TimesheetEntry[]
  totalMinutes: number
}

export interface TimesheetData {
  startDate: string
  endDate: string
  days: TimesheetDay[]
  issuesSummary: Array<{
    issueKey: string
    issueTitle: string
    projectName: string
    totalMinutes: number
  }>
  totalMinutes: number
}

export interface TeamTimesheetMember {
  userId: string
  displayName: string
  avatarUrl?: string
  dailyMinutes: number[]
  totalMinutes: number
}

export interface TeamTimesheetData {
  startDate: string
  endDate: string
  dates: string[]
  members: TeamTimesheetMember[]
  dailyTotals: number[]
  totalMinutes: number
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

export function useSprintBurnup(projectId: string, sprintId: string) {
  return useQuery({
    queryKey: ['reports', 'burnup', projectId, sprintId],
    queryFn: async () => {
      const { data } = await api.get(
        `/projects/${projectId}/reports/sprint-burnup`,
        { params: { sprintId } },
      )
      return data.data as BurnupData
    },
    enabled: !!projectId && !!sprintId,
  })
}

export function useCreatedVsResolved(
  projectId: string,
  startDate?: string,
  endDate?: string,
  interval?: string,
) {
  return useQuery({
    queryKey: ['reports', 'createdVsResolved', projectId, startDate, endDate, interval],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (interval) params.interval = interval
      const { data } = await api.get(
        `/projects/${projectId}/reports/created-vs-resolved`,
        { params },
      )
      return data.data as CreatedVsResolvedData
    },
    enabled: !!projectId,
  })
}

export function useTimesheet(
  userId: string,
  startDate?: string,
  endDate?: string,
) {
  // The timesheet endpoint is under /projects/:projectId/reports/timesheet
  // but it's user-scoped. We use a placeholder projectId and pass userId as query param.
  return useQuery({
    queryKey: ['reports', 'timesheet', userId, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = { userId }
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      // Use a generic path — the backend extracts userId from query
      const { data } = await api.get(`/reports/timesheet`, { params })
      return data.data as TimesheetData
    },
    enabled: !!userId,
  })
}

export function useTeamTimesheet(
  projectId: string,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ['reports', 'teamTimesheet', projectId, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const { data } = await api.get(
        `/reports/team-timesheet`,
        { params: { ...params, projectId } },
      )
      return data.data as TeamTimesheetData
    },
    enabled: !!projectId,
  })
}

export function useExportIssues(projectId: string) {
  return {
    exportJson: async () => {
      const response = await api.get(
        `/projects/${projectId}/reports/export`,
        { params: { format: 'json' }, responseType: 'blob' },
      )
      downloadBlob(response.data, `${projectId}-issues.json`, 'application/json')
    },
    exportCsv: async () => {
      const response = await api.get(
        `/projects/${projectId}/reports/export`,
        { params: { format: 'csv' }, responseType: 'blob' },
      )
      downloadBlob(response.data, `${projectId}-issues.csv`, 'text/csv')
    },
  }
}

function downloadBlob(blob: Blob, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
