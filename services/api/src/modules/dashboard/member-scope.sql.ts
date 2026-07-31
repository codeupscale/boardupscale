/**
 * Shared SQL fragment scoping dashboard queries to a single user's
 * "own + enrolled" projects: projects they own (projects.owner_id) or are
 * an explicit project_members row on. Used by all /dashboard/member queries.
 * Params: $1 = organizationId, $2 = userId.
 *
 * Pass `projectIdParamIndex` to additionally narrow the scoped set down to
 * one specific project (the dashboard's project filter) — the caller
 * chooses the placeholder index since each query has its own param layout.
 * A NULL value at that index means "no filter" (all owned/enrolled projects).
 */
export function buildMemberScopedProjectsCte(
  projectIdParamIndex?: number,
): string {
  const filterClause = projectIdParamIndex
    ? `AND ($${projectIdParamIndex}::uuid IS NULL OR p.id = $${projectIdParamIndex})`
    : '';
  return `
member_scoped_projects AS (
  SELECT DISTINCT p.id AS project_id
  FROM projects p
  WHERE p.organization_id = $1
    ${filterClause}
    AND (
      p.owner_id = $2
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = $2
      )
    )
)
`;
}

/** Unfiltered "own + enrolled" scope — used where the dashboard project filter does not apply. */
export const MEMBER_SCOPED_PROJECTS_CTE = buildMemberScopedProjectsCte();

/**
 * Mirrors PROJECT_HEALTH_ROLLUP_CTE (project-health.sql.ts) but joined
 * against member_scoped_projects instead of filtering by organization_id
 * alone. Must be preceded by MEMBER_SCOPED_PROJECTS_CTE in the same WITH
 * clause. Downstream classification (PROJECT_HEALTH_STATUS_SQL /
 * PROJECT_HEALTH_PROGRESS_SQL / PROJECT_HEALTH_SORT_RANK_SQL) is reused
 * unchanged from project-health.sql.ts.
 */
export const MEMBER_PROJECT_HEALTH_ROLLUP_CTE = `
project_issue_stats AS (
  SELECT
    p.id AS project_id,
    p.name,
    p.key,
    p.type,
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
  INNER JOIN member_scoped_projects msp ON msp.project_id = p.id
  LEFT JOIN issues i
    ON i.project_id = p.id
   AND i.organization_id = p.organization_id
  LEFT JOIN issue_statuses s ON s.id = i.status_id
  GROUP BY p.id
),
blocked_stats AS (
  SELECT
    i.project_id,
    COUNT(DISTINCT i.id)::int AS blocked_open_tickets
  FROM issues i
  INNER JOIN member_scoped_projects msp ON msp.project_id = i.project_id
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
  INNER JOIN member_scoped_projects msp ON msp.project_id = sp.project_id
  WHERE sp.status = 'active'
  ORDER BY sp.project_id, sp.start_date DESC NULLS LAST
),
project_rollups AS (
  SELECT
    pis.project_id,
    pis.name,
    pis.key,
    pis.type,
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
