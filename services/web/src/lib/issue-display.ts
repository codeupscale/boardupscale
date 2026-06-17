import type { Issue, Sprint } from '@/types'

/** Story points are optional — hide zero/empty values in compact UI surfaces. */
export function hasStoryPoints(storyPoints?: number | null): boolean {
  if (storyPoints == null) return false
  return Number(storyPoints) > 0
}

/** Format story points for display (handles decimal DB values like 3.5). */
export function formatStoryPoints(storyPoints: number): string {
  const value = Number(storyPoints)
  return Number.isInteger(value) ? String(value) : String(value)
}

type SprintRef = Pick<Sprint, 'id' | 'name' | 'status'>

/** Resolve sprint label for an issue, with optional lookup when only sprintId is present. */
export function resolveIssueSprintName(
  issue: Pick<Issue, 'sprint' | 'sprintId'>,
  sprintLookup?: ReadonlyMap<string, SprintRef> | ReadonlyArray<SprintRef>,
): string | null {
  if (issue.sprint?.name) return issue.sprint.name

  if (!issue.sprintId) return null

  if (sprintLookup instanceof Map) {
    return sprintLookup.get(issue.sprintId)?.name ?? null
  }

  if (Array.isArray(sprintLookup)) {
    return sprintLookup.find((s) => s.id === issue.sprintId)?.name ?? null
  }

  return null
}

/** Build sprint relation for optimistic cache patches (backlog drag, etc.). */
export function resolveIssueSprint(
  sprintId: string | null | undefined,
  current?: Pick<Issue, 'sprint'>,
  sprintLookup?: ReadonlyArray<SprintRef>,
): SprintRef | undefined {
  if (!sprintId) return undefined
  if (current?.sprint?.id === sprintId) return current.sprint
  return sprintLookup?.find((s) => s.id === sprintId)
}
