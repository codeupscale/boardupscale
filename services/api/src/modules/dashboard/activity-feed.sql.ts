/**
 * Keyset cursor for the member dashboard's "Recent Project Activity" infinite
 * scroll — mirrors project-health.sql.ts's cursor pattern (opaque base64url
 * JSON) but keyed on (created_at, id) to match the feed's DESC order.
 */
export interface ActivityFeedCursorPayload {
  createdAt: string;
  id: string;
}

export function encodeActivityFeedCursor(
  payload: ActivityFeedCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeActivityFeedCursor(
  cursor: string | undefined | null,
): ActivityFeedCursorPayload | null {
  if (!cursor || !cursor.trim()) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as ActivityFeedCursorPayload;
    if (
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
