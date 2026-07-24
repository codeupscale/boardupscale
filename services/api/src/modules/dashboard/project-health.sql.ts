import {
  HEALTH_AT_RISK_OPEN_MIN,
  HEALTH_AT_RISK_OVERDUE_MIN,
  PROJECT_HEALTH_SORT_ORDER,
  ProjectHealthStatus,
} from './project-health.constants';

/**
 * Shared CTE that rolls up per-project issue stats for an org ($1 = organization_id).
 * Used by status-count aggregates and keyset-paged health table.
 */
export const PROJECT_HEALTH_ROLLUP_CTE = `
project_issue_stats AS (
  SELECT
    p.id AS project_id,
    p.name,
    p.key,
    p.type,
    p.status AS project_lifecycle,
    COUNT(i.id) FILTER (WHERE i.deleted_at IS NULL) AS total_tickets,
    COUNT(i.id) FILTER (
      WHERE i.deleted_at IS NULL AND s.category = 'done'
    ) AS completed_tickets,
    COUNT(i.id) FILTER (
      WHERE i.deleted_at IS NULL AND (s.category IS NULL OR s.category <> 'done')
    ) AS open_tickets,
    COUNT(i.id) FILTER (
      WHERE i.deleted_at IS NULL
        AND (s.category IS NULL OR s.category <> 'done')
        AND i.due_date < CURRENT_DATE
    ) AS overdue_tickets
  FROM projects p
  LEFT JOIN issues i
    ON i.project_id = p.id
   AND i.organization_id = p.organization_id
  LEFT JOIN issue_statuses s ON s.id = i.status_id
  WHERE p.organization_id = $1
  GROUP BY p.id
),
blocked_stats AS (
  SELECT
    i.project_id,
    COUNT(DISTINCT i.id)::int AS blocked_open_tickets
  FROM issues i
  INNER JOIN issue_statuses st ON st.id = i.status_id AND st.category <> 'done'
  INNER JOIN issue_links l ON (
    (l.source_issue_id = i.id AND l.link_type = 'is_blocked_by')
    OR (l.target_issue_id = i.id AND l.link_type = 'blocks')
  )
  WHERE i.organization_id = $1
    AND i.deleted_at IS NULL
  GROUP BY i.project_id
),
active_sprints AS (
  SELECT DISTINCT ON (sp.project_id)
    sp.project_id,
    sp.name AS active_sprint_name
  FROM sprints sp
  INNER JOIN projects p ON p.id = sp.project_id AND p.organization_id = $1
  WHERE sp.status = 'active'
  ORDER BY sp.project_id, sp.start_date DESC NULLS LAST
),
project_rollups AS (
  SELECT
    pis.project_id,
    pis.name,
    pis.key,
    pis.type,
    pis.project_lifecycle,
    pis.total_tickets::int AS total_tickets,
    pis.completed_tickets::int AS completed_tickets,
    pis.open_tickets::int AS open_tickets,
    pis.overdue_tickets::int AS overdue_tickets,
    COALESCE(bs.blocked_open_tickets, 0)::int AS blocked_open_tickets,
    aspr.active_sprint_name
  FROM project_issue_stats pis
  LEFT JOIN blocked_stats bs ON bs.project_id = pis.project_id
  LEFT JOIN active_sprints aspr ON aspr.project_id = pis.project_id
)
`;

/**
 * SQL CASE mirroring classifyProjectHealth() — keep in sync with classifier.ts.
 * Expects columns: total_tickets, completed_tickets, open_tickets,
 * blocked_open_tickets, overdue_tickets.
 */
export const PROJECT_HEALTH_STATUS_SQL = `
CASE
  WHEN total_tickets = 0 THEN 'blocked'
  WHEN open_tickets = 0
    AND blocked_open_tickets = 0
    AND overdue_tickets = 0
    AND completed_tickets = total_tickets
    THEN 'completed'
  WHEN open_tickets >= ${HEALTH_AT_RISK_OPEN_MIN}
    AND overdue_tickets >= ${HEALTH_AT_RISK_OVERDUE_MIN}
    THEN 'at_risk'
  WHEN open_tickets > 0 OR overdue_tickets > 0 THEN 'active'
  ELSE 'at_risk'
END
`;

export const PROJECT_HEALTH_SORT_RANK_SQL = `
CASE health_status
  WHEN 'blocked' THEN ${PROJECT_HEALTH_SORT_ORDER.blocked}
  WHEN 'at_risk' THEN ${PROJECT_HEALTH_SORT_ORDER.at_risk}
  WHEN 'active' THEN ${PROJECT_HEALTH_SORT_ORDER.active}
  WHEN 'completed' THEN ${PROJECT_HEALTH_SORT_ORDER.completed}
  ELSE 99
END
`;

export const PROJECT_HEALTH_PROGRESS_SQL = `
CASE
  WHEN total_tickets > 0
    THEN ROUND((completed_tickets::numeric / total_tickets) * 100)::int
  ELSE 0
END
`;

export interface ProjectHealthCursorPayload {
  sortOrder: number;
  name: string;
  projectId: string;
}

export function encodeProjectHealthCursor(
  payload: ProjectHealthCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeProjectHealthCursor(
  cursor: string | undefined | null,
): ProjectHealthCursorPayload | null {
  if (!cursor || !cursor.trim()) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as ProjectHealthCursorPayload;
    if (
      typeof parsed.sortOrder !== 'number' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.projectId !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isProjectHealthStatus(
  value: string,
): value is ProjectHealthStatus {
  return (
    value === 'active' ||
    value === 'at_risk' ||
    value === 'blocked' ||
    value === 'completed'
  );
}
