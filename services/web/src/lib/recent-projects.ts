export type RecentProject = { key: string; name: string }

const STORAGE_PREFIX = 'boardupscale:recent-projects'
const MAX_RECENT = 5
export const RECENT_PROJECTS_CHANGED = 'boardupscale:recent-projects-changed'

export function recentProjectsStorageKey(orgId: string, userId: string): string {
  return `${STORAGE_PREFIX}:${orgId}:${userId}`
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.key === 'string' && entry.key.length > 0 && typeof entry.name === 'string'
}

function parseRecentProjects(raw: string | null): RecentProject[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentProject)
  } catch {
    return []
  }
}

function notifyRecentProjectsChanged(): void {
  window.dispatchEvent(new CustomEvent(RECENT_PROJECTS_CHANGED))
}

export function readRecentProjects(orgId: string, userId: string): RecentProject[] {
  if (!orgId || !userId) return []
  try {
    return parseRecentProjects(localStorage.getItem(recentProjectsStorageKey(orgId, userId)))
  } catch {
    return []
  }
}

function writeRecentProjects(orgId: string, userId: string, list: RecentProject[]): void {
  if (!orgId || !userId) return
  try {
    localStorage.setItem(
      recentProjectsStorageKey(orgId, userId),
      JSON.stringify(list.slice(0, MAX_RECENT)),
    )
    notifyRecentProjectsChanged()
  } catch {
    // Private browsing / quota exceeded — skip silently; in-memory UI still works this session.
  }
}

export function pushRecentProject(orgId: string, userId: string, project: RecentProject): void {
  if (!project.key) return
  const list = readRecentProjects(orgId, userId).filter((p) => p.key !== project.key)
  list.unshift(project)
  writeRecentProjects(orgId, userId, list)
}

/** Replace a renamed project key in visit history (or add the new entry). */
export function renameRecentProjectKey(
  orgId: string,
  userId: string,
  previousKey: string,
  next: RecentProject,
): void {
  if (!previousKey || !next.key) return
  const list = readRecentProjects(orgId, userId).filter(
    (p) => p.key !== previousKey && p.key !== next.key,
  )
  list.unshift(next)
  writeRecentProjects(orgId, userId, list)
}

/** Drop entries whose keys no longer exist in the org project list. */
export function pruneRecentProjects(
  orgId: string,
  userId: string,
  validKeys: Iterable<string>,
): RecentProject[] {
  const valid = new Set(validKeys)
  const list = readRecentProjects(orgId, userId)
  const pruned = list.filter((p) => valid.has(p.key))
  if (pruned.length !== list.length) {
    writeRecentProjects(orgId, userId, pruned)
  }
  return pruned
}

export function subscribeRecentProjectsChanged(callback: () => void): () => void {
  window.addEventListener(RECENT_PROJECTS_CHANGED, callback)
  return () => window.removeEventListener(RECENT_PROJECTS_CHANGED, callback)
}
