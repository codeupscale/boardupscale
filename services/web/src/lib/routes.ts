/** Canonical client route for issue detail (UUID). */
export function issueDetailPath(issueId: string): string {
  return `/issues/${issueId}`
}

/** Absolute URL for sharing/copying issue links. */
export function issueDetailUrl(issueId: string, origin = window.location.origin): string {
  return `${origin}${issueDetailPath(issueId)}`
}
