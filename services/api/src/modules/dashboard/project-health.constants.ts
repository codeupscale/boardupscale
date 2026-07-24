/** Shared constants for org dashboard project-health classification. */

/** At Risk when open count AND overdue count both meet these floors. */
export const HEALTH_AT_RISK_OPEN_MIN = 5;
export const HEALTH_AT_RISK_OVERDUE_MIN = 3;

export const DASHBOARD_CACHE_TTL_SECONDS = 30;
/** @deprecated Table rows are paged via /dashboard/organization/project-health */
export const DASHBOARD_PROJECT_HEALTH_LIMIT = 100;
export const DASHBOARD_ACTIVITY_FEED_LIMIT = 6;
export const DASHBOARD_PROJECT_HEALTH_CACHE_TTL_SECONDS = 20;

export const DASHBOARD_ACTIVITY_ACTIONS = [
  'created',
  'assigned',
  'commented',
  'status_changed',
  'updated',
] as const;

export type DashboardRange = '7d' | '30d';

export const DASHBOARD_RANGE_DAYS: Record<DashboardRange, number> = {
  '7d': 7,
  '30d': 30,
};

export type ProjectHealthStatus =
  | 'active'
  | 'at_risk'
  | 'blocked'
  | 'completed';

export const PROJECT_HEALTH_SORT_ORDER: Record<ProjectHealthStatus, number> = {
  blocked: 0,
  at_risk: 1,
  active: 2,
  completed: 3,
};

/** Chart segment order for org health + projects-by-status donuts */
export const PROJECT_HEALTH_CHART_KEYS: ProjectHealthStatus[] = [
  'active',
  'at_risk',
  'blocked',
  'completed',
];
