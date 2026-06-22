/** Extract a user-facing API error message, including structured sprint handoff errors. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
  if (!data) return fallback

  const base =
    (typeof data.message === 'string' && data.message) ||
    (typeof data.error === 'string' && data.error) ||
    fallback

  // Sprint handoff errors already include ticket keys and status names in `message`.
  if (data.code === 'SPRINT_HANDOFF_BLOCKED' || data.code === 'SPRINT_ACTIVE_NOT_ENDED') {
    return base
  }

  return base
}
