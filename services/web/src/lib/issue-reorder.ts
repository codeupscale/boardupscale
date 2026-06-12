import type { Issue } from '@/types'

export type IssueReorderPayloadItem = {
  issueId: string
  statusId: string
  position: number
  sprintId?: string | null
}

function resolveStatusId(issue: Issue): string {
  return issue.statusId ?? issue.status?.id ?? ''
}

export function compareIssueOrder(a: Issue, b: Issue): number {
  if (a.position !== b.position) return a.position - b.position
  const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return bCreated - aCreated
}

export function sortIssuesByPosition(issues: Issue[]): Issue[] {
  return [...issues].sort(compareIssueOrder)
}

/** Insert or replace a newly created issue and keep list sorted (backlog / issues queries). */
export function mergeCreatedIssue(issues: Issue[], created: Issue): Issue[] {
  return sortIssuesByPosition([...issues.filter((issue) => issue.id !== created.id), created])
}

/**
 * Assign strictly unique positions for a container reorder.
 * Board drag-and-drop can leave duplicate position values (per-column 0,1,2…);
 * duplicates make backlog sort fall back to createdAt and undo the drag.
 */
export function distributeUniquePositions(
  sourceIssues: Issue[],
  slotCount: number,
): number[] {
  if (slotCount <= 0) return []
  if (slotCount === 1) return [sourceIssues[0]?.position ?? 0]

  const sorted = [...sourceIssues.map((issue) => issue.position)].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]

  const isStrictlyIncreasing =
    sorted.length === slotCount &&
    sorted.every((position, index) => index === 0 || position > sorted[index - 1])

  if (isStrictlyIncreasing) return sorted

  if (min === max) {
    return Array.from({ length: slotCount }, (_, index) => min + (index + 1) / (slotCount + 1))
  }

  return Array.from({ length: slotCount }, (_, index) =>
    min + ((max - min) * index) / (slotCount - 1),
  )
}

/**
 * Build reorder API items for drag-and-drop within a single backlog container.
 * Reassigns the container's existing position values in the new order.
 */
export function buildContainerReorderItems(
  containerIssues: Issue[],
  sourceIndex: number,
  destIndex: number,
): IssueReorderPayloadItem[] {
  if (sourceIndex === destIndex || containerIssues.length < 2) return []

  const reordered = [...containerIssues]
  const [moved] = reordered.splice(sourceIndex, 1)
  reordered.splice(destIndex, 0, moved)

  const positions = distributeUniquePositions(containerIssues, reordered.length)

  return reordered.map((issue, index) => ({
    issueId: issue.id,
    statusId: resolveStatusId(issue),
    position: positions[index],
  }))
}

/**
 * Build reorder API items when an issue is dropped into a different container
 * (sprint ↔ backlog) at a specific index.
 */
export function buildContainerInsertItems(
  destContainerIssues: Issue[],
  movedIssue: Issue,
  insertIndex: number,
  destSprintId: string | null,
): IssueReorderPayloadItem[] {
  const clampedIndex = Math.max(0, Math.min(insertIndex, destContainerIssues.length))
  const newList = [...destContainerIssues]
  newList.splice(clampedIndex, 0, movedIssue)

  if (newList.length === 1) {
    return [{
      issueId: movedIssue.id,
      statusId: resolveStatusId(movedIssue),
      position: movedIssue.position,
      sprintId: destSprintId,
    }]
  }

  const positions = distributeUniquePositions(
    [...destContainerIssues, movedIssue],
    newList.length,
  )

  return newList.map((issue, index) => ({
    issueId: issue.id,
    statusId: resolveStatusId(issue),
    position: positions[index],
    ...(issue.id === movedIssue.id ? { sprintId: destSprintId } : {}),
  }))
}

/** Apply reorder payload (position + optional sprint) and re-sort for instant UI. */
export function applyContainerUpdates(
  issues: Issue[],
  updates: IssueReorderPayloadItem[],
): Issue[] {
  const updateById = new Map(updates.map((item) => [item.issueId, item]))
  const withUpdates = issues.map((issue) => {
    const patch = updateById.get(issue.id)
    if (!patch) return issue
    return {
      ...issue,
      position: patch.position,
      ...(patch.sprintId !== undefined
        ? { sprintId: patch.sprintId ?? undefined }
        : {}),
    }
  })
  return [...withUpdates].sort(compareIssueOrder)
}
