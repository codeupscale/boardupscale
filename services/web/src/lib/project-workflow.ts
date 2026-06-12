import type { QueryClient } from '@tanstack/react-query'
import { Project, ProjectType } from '@/types'

export const PROJECT_TYPE = {
  SCRUM: ProjectType.SCRUM,
  KANBAN: ProjectType.KANBAN,
} as const

export function isKanbanProject(type?: string | ProjectType | null): boolean {
  return type === ProjectType.KANBAN
}

/** Scrum and all non-kanban templates use sprint-gated board visibility. */
export function isScrumWorkflow(type?: string | ProjectType | null): boolean {
  return !isKanbanProject(type)
}

export function shouldShowIssueOnBoard(
  issue: { sprintId?: string | null; type?: string },
  projectType?: string | ProjectType | null,
): boolean {
  if (issue.type === 'subtask' || issue.type === 'epic') return false
  return !!issue.sprintId || isKanbanProject(projectType)
}

export function resolveProjectTypeFromCache(
  qc: QueryClient,
  projectId: string,
): ProjectType | undefined {
  const cached = qc.getQueryData<Project>(['project', projectId])
  if (cached?.type) return cached.type

  for (const [, project] of qc.getQueriesData<Project>({ queryKey: ['project'] })) {
    if (project && (project.id === projectId || project.key === projectId)) {
      return project.type
    }
  }
  return undefined
}
