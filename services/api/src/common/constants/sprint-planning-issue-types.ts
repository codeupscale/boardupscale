/** Issue types that participate in sprint planning, handoff, and completion. */
export const SPRINT_PLANNING_ISSUE_TYPES = ['story', 'task', 'bug'] as const;

/** Containers / child work — never assigned to or evaluated for sprints. */
export const SPRINT_INELIGIBLE_ISSUE_TYPES = ['epic', 'subtask'] as const;

export type SprintPlanningIssueType = (typeof SPRINT_PLANNING_ISSUE_TYPES)[number];
export type SprintIneligibleIssueType = (typeof SPRINT_INELIGIBLE_ISSUE_TYPES)[number];

export function isSprintEligibleIssueType(type: string | null | undefined): boolean {
  if (!type) {
    return false;
  }
  return !(SPRINT_INELIGIBLE_ISSUE_TYPES as readonly string[]).includes(type);
}

/** Returns sprint id for planning issues; always null for epic/subtask. */
export function normalizeSprintIdForIssueType(
  type: string | null | undefined,
  sprintId: string | null | undefined,
): string | null {
  if (!isSprintEligibleIssueType(type)) {
    return null;
  }
  return sprintId ?? null;
}
