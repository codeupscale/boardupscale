import type { QueryClient } from '@tanstack/react-query'
import { Project, ProjectType } from '@/types'

export const PROJECT_TYPE = {
  SCRUM: ProjectType.SCRUM,
  KANBAN: ProjectType.KANBAN,
} as const

export function isKanbanProject(type?: string | ProjectType | null): boolean {
  return type === ProjectType.KANBAN
}

/** Board cards: story / task / bug only — sprint assignment does not affect visibility. */
export function shouldShowIssueOnBoard(issue: { type?: string }): boolean {
  return issue.type !== 'subtask' && issue.type !== 'epic'
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
