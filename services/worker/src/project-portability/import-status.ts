/**
 * Import status column creation + issue status resolution (mirrors API transformer).
 * Single source of truth for portability status constants and helpers in the worker.
 */

export const KANBAN_BACKLOG_COLUMN = 'Backlog';
export const SCRUM_TODO_COLUMN = 'To Do';

export function isKanbanProjectType(type: string | null | undefined): boolean {
  return type === 'kanban';
}

export function isKanbanSourceBacklogColumn(
  sourceType: string | null | undefined,
  statusName: string | null | undefined,
): boolean {
  return (
    isKanbanProjectType(sourceType) &&
    normalizeName(statusName).toLowerCase() === KANBAN_BACKLOG_COLUMN.toLowerCase()
  );
}

export interface BundleStatusRow {
  sourceId: string;
  name: string;
  category: string;
  color: string;
  position: number;
  isDefault: boolean;
  wipLimit: number;
}

export interface StatusMappingEntry {
  sourceName: string;
  targetName: string;
  targetCategory?: string;
}

export interface ImportStatusColumn {
  name: string;
  category: string;
  color: string;
  position: number;
  isDefault: boolean;
  wipLimit: number;
}

export interface BundleIssueStatus {
  statusName: string;
  statusCategory: string;
  sprintSourceId: string | null;
}

const KANBAN_TEMPLATE: ImportStatusColumn[] = [
  { name: 'Backlog', category: 'todo', color: '#9CA3AF', position: 0, isDefault: true, wipLimit: 0 },
  { name: 'To Do', category: 'todo', color: '#6B7280', position: 1, isDefault: false, wipLimit: 0 },
  { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false, wipLimit: 0 },
  { name: 'Review', category: 'in_progress', color: '#F59E0B', position: 3, isDefault: false, wipLimit: 0 },
  { name: 'Done', category: 'done', color: '#10B981', position: 4, isDefault: false, wipLimit: 0 },
];

const SCRUM_TEMPLATE: ImportStatusColumn[] = [
  { name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true, wipLimit: 0 },
  { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false, wipLimit: 0 },
  { name: 'In Review', category: 'in_progress', color: '#F59E0B', position: 2, isDefault: false, wipLimit: 0 },
  { name: 'Done', category: 'done', color: '#10B981', position: 3, isDefault: false, wipLimit: 0 },
];

function isKanban(type: string | null | undefined): boolean {
  return isKanbanProjectType(type);
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim();
}

export function getPreviewMappings(preview: unknown): StatusMappingEntry[] {
  if (!preview || typeof preview !== 'object') {
    return [];
  }
  const p = preview as Record<string, unknown>;
  const mappings = p.statusMappings ?? p.status_mappings;
  return Array.isArray(mappings) ? (mappings as StatusMappingEntry[]) : [];
}

export function buildImportStatusColumns(
  sourceStatuses: BundleStatusRow[],
  preview: unknown,
  targetType: string,
): ImportStatusColumn[] {
  const mappings = getPreviewMappings(preview);
  const columns = new Map<string, ImportStatusColumn>();

  for (const mapping of mappings) {
    const src = sourceStatuses.find((s) => normalizeName(s.name) === mapping.sourceName);
    const key = mapping.targetName.toLowerCase();
    if (!columns.has(key)) {
      columns.set(key, {
        name: mapping.targetName,
        category: mapping.targetCategory ?? src?.category ?? 'todo',
        color: src?.color ?? '#6B7280',
        position: src?.position ?? columns.size,
        isDefault: src?.isDefault ?? false,
        wipLimit: src?.wipLimit ?? 0,
      });
    }
  }

  const backlogMapping = mappings.find((m) => m.sourceName === KANBAN_BACKLOG_COLUMN);
  if (backlogMapping) {
    const key = backlogMapping.targetName.toLowerCase();
    if (!columns.has(key)) {
      const backlogSrc = sourceStatuses.find(
        (s) => normalizeName(s.name).toLowerCase() === KANBAN_BACKLOG_COLUMN.toLowerCase(),
      );
      columns.set(key, {
        name: backlogMapping.targetName,
        category: 'todo',
        color: backlogSrc?.color ?? '#9CA3AF',
        position: backlogSrc?.position ?? 0,
        isDefault: true,
        wipLimit: backlogSrc?.wipLimit ?? 0,
      });
    }
  }

  const list = [...columns.values()].sort((a, b) => a.position - b.position);
  if (list.length === 0) {
    return isKanban(targetType) ? [...KANBAN_TEMPLATE] : [...SCRUM_TEMPLATE];
  }

  if (!list.some((s) => s.isDefault)) {
    list[0]!.isDefault = true;
  }
  return list;
}

export function buildStatusIdMap(
  preview: unknown,
  statusRows: Array<{ id: string; name: string }>,
): Map<string, string> {
  const nameToId = new Map(
    statusRows.map((r) => [r.name.trim().toLowerCase(), r.id]),
  );
  const map = new Map<string, string>();

  for (const entry of getPreviewMappings(preview)) {
    const targetId = nameToId.get(entry.targetName.trim().toLowerCase());
    if (!targetId) {
      continue;
    }
    map.set(entry.sourceName, targetId);
    map.set(entry.sourceName.toLowerCase(), targetId);
  }

  const defaultId = nameToId.get(SCRUM_TODO_COLUMN.toLowerCase()) ?? statusRows[0]?.id;
  if (defaultId) {
    map.set('__default__', defaultId);
  }
  return map;
}

export function resolveTargetStatusId(
  issue: BundleIssueStatus,
  sourceType: string | null,
  targetType: string,
  statusMap: Map<string, string>,
  statusRows: Array<{ id: string; name: string; category: string }>,
): string {
  const sourceName = normalizeName(issue.statusName);
  let lookupKey = sourceName;

  if (!isKanban(targetType) && isKanbanSourceBacklogColumn(sourceType, issue.statusName)) {
    lookupKey = SCRUM_TODO_COLUMN;
  }

  const resolved =
    statusMap.get(lookupKey) ??
    statusMap.get(lookupKey.toLowerCase()) ??
    statusMap.get(sourceName) ??
    statusMap.get(sourceName.toLowerCase()) ??
    statusMap.get('__default__');

  if (resolved) {
    return resolved;
  }

  const category = issue.statusCategory ?? 'todo';
  const byCategory = statusRows.find((r) => r.category === category);
  if (byCategory) {
    return byCategory.id;
  }

  return statusRows[0]?.id ?? '';
}
