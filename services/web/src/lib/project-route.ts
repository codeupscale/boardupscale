import type { Issue, Project } from '@/types'

/** Canonical project segment for `/projects/:key/...` routes — prefers short key over UUID. */
export function resolveProjectRouteKey(
  issue: Pick<Issue, 'projectId' | 'project'> | undefined,
  project: Pick<Project, 'key'> | undefined,
): string | undefined {
  if (!issue?.projectId) return undefined
  return issue.project?.key || project?.key || issue.projectId
}

/** Project display name for breadcrumbs — issue embed is available immediately on detail fetch. */
export function resolveProjectDisplayName(
  issue: Pick<Issue, 'project'> | undefined,
  project: Pick<Project, 'name'> | undefined,
): string {
  return issue?.project?.name || project?.name || '...'
}

export function projectBoardHref(projectRouteKey: string): string {
  return `/projects/${projectRouteKey}/board`
}
