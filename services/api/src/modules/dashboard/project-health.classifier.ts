import {
  HEALTH_AT_RISK_OPEN_MIN,
  HEALTH_AT_RISK_OVERDUE_MIN,
  ProjectHealthStatus,
} from './project-health.constants';

export interface ProjectHealthInput {
  totalTickets: number;
  completedTickets: number;
  openTickets: number;
  blockedOpenTickets: number;
  overdueTickets: number;
}

export interface ProjectHealthResult {
  status: ProjectHealthStatus;
  progressPercent: number;
  completedRatio: number;
}

/**
 * Precedence: Blocked → Completed → At Risk → Active.
 *
 * | Status    | Rule |
 * |-----------|------|
 * | Blocked   | Project exists but has zero tickets |
 * | Completed | open=0, blocked=0, overdue=0, and every ticket is done |
 * | At Risk   | open count high AND overdue count high |
 * | Active    | Has open and/or overdue work (not meeting At Risk) |
 */
export function classifyProjectHealth(
  input: ProjectHealthInput,
): ProjectHealthResult {
  const total = Math.max(0, Number(input.totalTickets) || 0);
  const completed = Math.max(0, Number(input.completedTickets) || 0);
  const open = Math.max(0, Number(input.openTickets) || 0);
  const blocked = Math.max(0, Number(input.blockedOpenTickets) || 0);
  const overdue = Math.max(0, Number(input.overdueTickets) || 0);

  const completedRatio = total > 0 ? completed / total : 0;
  const progressPercent =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  // Empty project → Blocked
  if (total === 0) {
    return { status: 'blocked', progressPercent: 0, completedRatio: 0 };
  }

  // All work finished → Completed / Done
  if (
    open === 0 &&
    blocked === 0 &&
    overdue === 0 &&
    completed === total
  ) {
    return { status: 'completed', progressPercent: 100, completedRatio: 1 };
  }

  // High open + high overdue → At Risk
  if (
    open >= HEALTH_AT_RISK_OPEN_MIN &&
    overdue >= HEALTH_AT_RISK_OVERDUE_MIN
  ) {
    return { status: 'at_risk', progressPercent, completedRatio };
  }

  // Has open or overdue work → Active
  if (open > 0 || overdue > 0) {
    return { status: 'active', progressPercent, completedRatio };
  }

  // Tickets exist but none open/overdue (e.g. only blocked links left) → At Risk
  return { status: 'at_risk', progressPercent, completedRatio };
}
