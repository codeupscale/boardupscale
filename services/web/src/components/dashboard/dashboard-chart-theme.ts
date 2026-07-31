import type { CSSProperties } from 'react'
import type { ProjectHealthStatus } from '@/hooks/useOrgDashboard'

/** Neon accent used for activity pulse, progress, links */
export const DASHBOARD_ACCENT = '#8b5cf6'

export const DASHBOARD_EMPTY_RING_FILL = 'rgba(139, 92, 246, 0.22)'

/** Mockup-aligned status palette */
export const HEALTH_STATUS_COLORS: Record<ProjectHealthStatus, string> = {
  active: '#22c55e',
  at_risk: '#f59e0b',
  blocked: '#ef4444',
  completed: '#3b82f6',
}

export const HEALTH_STATUS_LABELS: Record<ProjectHealthStatus, string> = {
  active: 'Active',
  at_risk: 'At Risk',
  blocked: 'Blocked',
  completed: 'Done',
}

export type MemberRoleBucket =
  | 'org_owner'
  | 'org_administrator'
  | 'project_admin'
  | 'project_member'
  | 'project_viewer'
  | 'org_user'

export const MEMBER_ROLE_COLORS: Record<MemberRoleBucket, string> = {
  org_owner: '#a78bfa',
  org_administrator: '#38bdf8',
  project_admin: '#34d399',
  project_member: '#fbbf24',
  project_viewer: '#94a3b8',
  org_user: '#fb7185',
}

export const MEMBER_ROLE_LABELS: Record<MemberRoleBucket, string> = {
  org_owner: 'Org Owners',
  org_administrator: 'Org Admins',
  project_admin: 'Project Admins',
  project_member: 'Project Members',
  project_viewer: 'Project Viewers',
  org_user: 'Org Users',
}

export function getHealthStatusColor(key: string): string {
  return HEALTH_STATUS_COLORS[key as ProjectHealthStatus] ?? '#94a3b8'
}

export function getHealthStatusLabel(key: string): string {
  return HEALTH_STATUS_LABELS[key as ProjectHealthStatus] ?? key.replace(/_/g, ' ')
}

export type IssueStatusBucket = 'todo' | 'in_progress' | 'blocked' | 'done'

/**
 * Issue-status donut palette (member dashboard "Open Issues by Status").
 * Kept separate from getHealthStatusColor/Label — 'blocked' is a valid key
 * in both domains (project health vs. issue status) with different meaning;
 * sharing one resolver would silently conflate the two.
 */
export const ISSUE_STATUS_COLORS: Record<IssueStatusBucket, string> = {
  todo: '#a78bfa',
  in_progress: '#38bdf8',
  blocked: '#ef4444',
  done: '#22c55e',
}

export const ISSUE_STATUS_LABELS: Record<IssueStatusBucket, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

export function getIssueStatusColor(key: string): string {
  return ISSUE_STATUS_COLORS[key as IssueStatusBucket] ?? '#94a3b8'
}

export function getIssueStatusLabel(key: string): string {
  return ISSUE_STATUS_LABELS[key as IssueStatusBucket] ?? key.replace(/_/g, ' ')
}

/**
 * Donut geometry derived from box size (mockup-scale).
 * Radii scale with container so charts stay proportional across breakpoints.
 */
export type DonutSizeToken = 'md' | 'lg'

export const DONUT_BOX_PX: Record<DonutSizeToken, number> = {
  md: 180,
  lg: 220,
}

export function getDonutRadii(boxPx: number): { outer: number; inner: number } {
  return {
    outer: Math.round(boxPx * 0.45),
    inner: Math.round(boxPx * 0.28),
  }
}

/** Shared panel metrics so Health / Activity / Status cards stay aligned */
export const DASHBOARD_PANEL = {
  minHeightClass: 'min-h-[320px]',
  cardClassName:
    'flex flex-col w-full min-w-0 h-full border-border/80 bg-card/90',
  activityChartHeightPx: 100,
  activityFeedSlots: 4,
  activityFeedSlotMinHeightPx: 36,
  /** Enterprise table: ~10 rows visible; more via infinite scroll. */
  projectHealthPageSize: 10,
  projectHealthViewportRows: 10,
  projectHealthRowHeightPx: 48,
} as const

export const PROJECT_HEALTH_STATUS_FILTER_OPTIONS: Array<{
  value: ProjectHealthStatus | 'all'
  label: string
}> = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: HEALTH_STATUS_LABELS.active },
  { value: 'at_risk', label: HEALTH_STATUS_LABELS.at_risk },
  { value: 'blocked', label: HEALTH_STATUS_LABELS.blocked },
  { value: 'completed', label: HEALTH_STATUS_LABELS.completed },
]

export const DASHBOARD_TOOLTIP_STYLE: CSSProperties = {
  borderRadius: 8,
  border: '1px solid rgba(139, 92, 246, 0.35)',
  backgroundColor: '#12121a',
  color: '#f4f4f5',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  padding: '8px 12px',
  fontSize: 12,
}

export const DASHBOARD_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: '#f4f4f5',
  marginBottom: 4,
  fontWeight: 600,
}

export const DASHBOARD_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: '#e4e4e7',
}
