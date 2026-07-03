/** Matches Jira-style issue keys: PREFIX-123 (prefix 1+ alnum, number 1+ digits). */
const ISSUE_KEY_QUERY_PATTERN = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

export interface ParsedIssueKeyQuery {
  prefix: string;
  number: number;
  /** Original query normalized to uppercase prefix form, e.g. SCRUM-2 */
  formerKey: string;
}

/**
 * Parse a search query that looks like an issue key.
 * Returns null for free-text queries to avoid unnecessary alias lookups.
 */
export function parseIssueKeyQuery(q: string): ParsedIssueKeyQuery | null {
  const trimmed = q.trim();
  if (!trimmed || trimmed.length > 30) {
    return null;
  }

  const match = ISSUE_KEY_QUERY_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const prefix = match[1].toUpperCase();
  const number = Number.parseInt(match[2], 10);
  if (!Number.isFinite(number) || number < 1) {
    return null;
  }

  return {
    prefix,
    number,
    formerKey: `${prefix}-${number}`,
  };
}
