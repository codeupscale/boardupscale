import { Project } from './entities/project.entity';

/** Project row returned by the paginated list endpoint, with aggregate counts. */
export interface ProjectListItem extends Project {
  memberCount: number;
  issueCount: number;
}

/** Safely coerce a SQL aggregate to a non-negative integer. */
export function parseAggregateCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

export function toProjectListItem(
  project: Project,
  raw: Record<string, unknown>,
): ProjectListItem {
  return {
    ...project,
    memberCount: parseAggregateCount(raw.memberCount),
    issueCount: parseAggregateCount(raw.issueCount),
  };
}
