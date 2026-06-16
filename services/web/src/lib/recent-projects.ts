export type RecentProject = { key: string; name: string }

export function recentProjectsStorageKey(orgId: string, userId: string): string {
  return `boardupscale:recent-projects:${orgId}:${userId}`
}

export function readRecentProjects(orgId: string, userId: string): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(recentProjectsStorageKey(orgId, userId)) || '[]')
  } catch {
    return []
  }
}

export function pushRecentProject(orgId: string, userId: string, project: RecentProject): void {
  const list = readRecentProjects(orgId, userId).filter((p) => p.key !== project.key)
  list.unshift(project)
  localStorage.setItem(recentProjectsStorageKey(orgId, userId), JSON.stringify(list.slice(0, 5)))
}

/** Rewrite sidebar recent-project entry after a key rename. */
export function renameRecentProjectKey(
  orgId: string,
  userId: string,
  oldKey: string,
  newKey: string,
  name?: string,
): void {
  const list = readRecentProjects(orgId, userId).map((p) =>
    p.key === oldKey ? { key: newKey, name: name ?? p.name } : p,
  )
  localStorage.setItem(recentProjectsStorageKey(orgId, userId), JSON.stringify(list))
}
