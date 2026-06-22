import { PROJECT_TYPE, ProjectTypeValue, isKanbanProject } from '../projects/project-type';
import { PROJECT_TEMPLATES } from '../projects/project-templates';
import { ProjectTemplate } from '../projects/dto/create-project.dto';
import {
  BundleIssue,
  BundleStatus,
  BundleStatusCategory,
  ImportPreviewResult,
  ImportPreviewWarning,
  PortabilityImportOptions,
  StatusMappingEntry,
  SUPPORTED_BUNDLE_VERSIONS,
} from './types/project-bundle.types';

const STATUS_ALIASES: Record<string, string[]> = {
  'In Review': ['Review'],
  Review: ['In Review'],
};

const KANBAN_BACKLOG_COLUMN = 'Backlog';
const SCRUM_DEFAULT_TODO = 'To Do';

export function isKanbanBacklogStatusName(statusName: string | null | undefined): boolean {
  return normalizeName(statusName).toLowerCase() === KANBAN_BACKLOG_COLUMN.toLowerCase();
}

export interface ImportStatusColumn {
  name: string;
  category: BundleStatusCategory;
  color: string;
  position: number;
  isDefault: boolean;
  wipLimit: number;
}

export interface TransformedIssue {
  title: string;
  description: string | null;
  type: string;
  priority: string;
  targetStatusName: string;
  sprintSourceId: string | null;
  storyPoints: number | null;
  timeEstimate: number | null;
  timeSpent: number;
  dueDate: string | null;
  labels: string[];
  position: number;
  assigneeEmail: string | null;
  reporterEmail: string;
  parentSourceId: string | null;
  sourceId: string;
  sourceKey: string;
}

export function getTargetStatusesForType(targetType: ProjectTypeValue): BundleStatus[] {
  const templateKey = isKanbanProject(targetType)
    ? ProjectTemplate.KANBAN
    : ProjectTemplate.SCRUM;
  const template = PROJECT_TEMPLATES[templateKey];
  if (!template?.statuses) {
    return [];
  }
  return template.statuses.map((s, index) => ({
    sourceId: `template-${index}`,
    name: s.name,
    category: s.category as BundleStatusCategory,
    color: s.color ?? '#6B7280',
    position: s.position ?? index,
    isDefault: s.isDefault ?? false,
    wipLimit: 0,
  }));
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim();
}

function findStatusByName(
  statuses: BundleStatus[],
  name: string,
): BundleStatus | undefined {
  const normalized = normalizeName(name).toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return statuses.find((s) => normalizeName(s.name).toLowerCase() === normalized);
}

function findStatusByCategory(
  statuses: BundleStatus[],
  category: BundleStatusCategory,
): BundleStatus | undefined {
  return statuses.find((s) => s.category === category);
}

function resolveStatusMapping(
  sourceStatus: Pick<BundleIssue, 'statusName' | 'statusCategory'>,
  sourceStatuses: BundleStatus[],
  targetStatuses: BundleStatus[],
  customMapping?: Record<string, string>,
): StatusMappingEntry {
  const sourceName = normalizeName(sourceStatus.statusName) || 'Unknown';
  const sourceCategory = sourceStatus.statusCategory ?? 'todo';

  const customTarget = customMapping?.[sourceName];
  if (customTarget) {
    const target = findStatusByName(targetStatuses, customTarget);
    return {
      sourceName,
      sourceCategory,
      targetName: target?.name ?? customTarget,
      targetCategory: (target?.category ?? sourceCategory) as BundleStatusCategory,
      method: 'custom',
    };
  }

  const exact = findStatusByName(targetStatuses, sourceName);
  if (exact) {
    return {
      sourceName,
      sourceCategory,
      targetName: exact.name,
      targetCategory: exact.category,
      method: 'exact',
    };
  }

  const aliases = STATUS_ALIASES[sourceName] ?? [];
  for (const alias of aliases) {
    const match = findStatusByName(targetStatuses, alias);
    if (match) {
      return {
        sourceName,
        sourceCategory,
        targetName: match.name,
        targetCategory: match.category,
        method: 'alias',
      };
    }
  }

  const byCategory = findStatusByCategory(targetStatuses, sourceCategory);
  if (byCategory) {
    return {
      sourceName,
      sourceCategory,
      targetName: byCategory.name,
      targetCategory: byCategory.category,
      method: 'category',
    };
  }

  const fallback =
    findStatusByName(targetStatuses, SCRUM_DEFAULT_TODO) ??
    targetStatuses[0];

  return {
    sourceName,
    sourceCategory,
    targetName: fallback?.name ?? SCRUM_DEFAULT_TODO,
    targetCategory: (fallback?.category ?? 'todo') as BundleStatusCategory,
    method: 'fallback',
  };
}

export function buildStatusMappings(
  sourceStatuses: BundleStatus[],
  sourceType: ProjectTypeValue,
  targetType: ProjectTypeValue,
  customMapping?: Record<string, string>,
  targetStatusesOverride?: BundleStatus[],
): StatusMappingEntry[] {
  const targetStatuses =
    targetStatusesOverride?.length
      ? targetStatusesOverride
      : sourceType === targetType
        ? sourceStatuses
        : getTargetStatusesForType(targetType);
  const uniqueSourceNames = new Set<string>();

  for (const status of sourceStatuses) {
    uniqueSourceNames.add(normalizeName(status.name));
  }

  const mappings: StatusMappingEntry[] = [];
  for (const name of uniqueSourceNames) {
    if (!name) {
      continue;
    }
    const sourceStatus = sourceStatuses.find((s) => normalizeName(s.name) === name);
    mappings.push(
      resolveStatusMapping(
        {
          statusName: name,
          statusCategory: (sourceStatus?.category ?? 'todo') as BundleStatusCategory,
        },
        sourceStatuses,
        targetStatuses,
        customMapping,
      ),
    );
  }

  return mappings;
}

/** Columns actually created on the target project during import (from bundle workflow, not bare template). */
export function buildImportStatusColumns(
  sourceStatuses: BundleStatus[],
  sourceType: ProjectTypeValue,
  targetType: ProjectTypeValue,
  customMapping?: Record<string, string>,
): ImportStatusColumn[] {
  const mappings = buildStatusMappings(sourceStatuses, sourceType, targetType, customMapping);
  const columns = new Map<string, ImportStatusColumn>();

  for (const mapping of mappings) {
    const src = sourceStatuses.find((s) => normalizeName(s.name) === mapping.sourceName);
    const key = mapping.targetName.toLowerCase();
    if (!columns.has(key)) {
      columns.set(key, {
        name: mapping.targetName,
        category: mapping.targetCategory,
        color: src?.color ?? '#6B7280',
        position: src?.position ?? columns.size,
        isDefault: src?.isDefault ?? false,
        wipLimit: src?.wipLimit ?? 0,
      });
    }
  }

  const backlogMapping = mappings.find((m) => m.sourceName === KANBAN_BACKLOG_COLUMN);
  const backlogKey = KANBAN_BACKLOG_COLUMN.toLowerCase();
  if (backlogMapping && isKanbanProject(targetType) && !columns.has(backlogKey)) {
    const backlogSrc = sourceStatuses.find(
      (s) => normalizeName(s.name).toLowerCase() === backlogKey,
    );
    columns.set(backlogKey, {
      name: backlogMapping.targetName,
      category: 'todo',
      color: backlogSrc?.color ?? '#9CA3AF',
      position: backlogSrc?.position ?? 0,
      isDefault: true,
      wipLimit: backlogSrc?.wipLimit ?? 0,
    });
  }

  const list = [...columns.values()].sort((a, b) => a.position - b.position);
  if (list.length === 0) {
    return getTargetStatusesForType(targetType).map((s) => ({
      name: s.name,
      category: s.category,
      color: s.color,
      position: s.position,
      isDefault: s.isDefault,
      wipLimit: s.wipLimit,
    }));
  }

  if (!list.some((s) => s.isDefault)) {
    list[0]!.isDefault = true;
  }
  return list;
}

export function transformIssueForImport(
  issue: BundleIssue,
  sourceType: ProjectTypeValue,
  targetType: ProjectTypeValue,
  statusMap: Map<string, string>,
): { transformed: TransformedIssue; sprintStripped: boolean; backlogRemapped: boolean } {
  let targetStatusName = statusMap.get(normalizeName(issue.statusName)) ?? SCRUM_DEFAULT_TODO;
  let sprintSourceId: string | null = issue.sprintSourceId;
  let sprintStripped = false;
  let backlogRemapped = false;

  if (isKanbanProject(targetType)) {
    if (sprintSourceId != null) {
      sprintSourceId = null;
      sprintStripped = true;
    }
  }

  if (!isKanbanProject(targetType) && isKanbanProject(sourceType)) {
    sprintSourceId = null;
    if (isKanbanBacklogStatusName(issue.statusName)) {
      targetStatusName = statusMap.get(SCRUM_DEFAULT_TODO) ?? SCRUM_DEFAULT_TODO;
      backlogRemapped = true;
    }
  }

  if (!isKanbanProject(targetType) && !isKanbanProject(sourceType) && sprintSourceId != null) {
    // Scrum → Scrum: keep sprint reference for phase 3 recreation
  }

  if (isKanbanProject(targetType) && isKanbanProject(sourceType)) {
    sprintSourceId = null;
  }

  return {
    transformed: {
      sourceId: issue.sourceId,
      sourceKey: issue.sourceKey,
      title: issue.title ?? '',
      description: issue.description ?? null,
      type: issue.type ?? 'task',
      priority: issue.priority ?? 'medium',
      targetStatusName,
      sprintSourceId: isKanbanProject(targetType) ? null : sprintSourceId,
      storyPoints: issue.storyPoints ?? null,
      timeEstimate: issue.timeEstimate ?? null,
      timeSpent: issue.timeSpent ?? 0,
      dueDate: issue.dueDate ?? null,
      labels: issue.labels ?? [],
      position: issue.position ?? 0,
      assigneeEmail: issue.assigneeEmail ?? null,
      reporterEmail: issue.reporterEmail ?? '',
      parentSourceId: issue.parentSourceId ?? null,
    },
    sprintStripped,
    backlogRemapped,
  };
}

export function buildImportPreview(
  sourceType: ProjectTypeValue,
  targetType: ProjectTypeValue,
  sourceProjectKey: string,
  targetProjectKey: string,
  targetProjectName: string,
  sourceStatuses: BundleStatus[],
  issues: BundleIssue[],
  sprintCount: number,
  commentCount: number,
  memberCount: number,
  customFieldCount: number,
  options?: PortabilityImportOptions,
  targetStatusesOverride?: BundleStatus[],
): ImportPreviewResult {
  const statusMappings = buildStatusMappings(
    sourceStatuses,
    sourceType,
    targetType,
    options?.statusMapping,
    targetStatusesOverride,
  );
  const statusMap = new Map(statusMappings.map((m) => [m.sourceName, m.targetName]));

  const warnings: ImportPreviewWarning[] = [];
  const dataLossItems: string[] = [];

  if (options?.mergeIntoExisting) {
    warnings.push({
      code: 'MERGE_INTO_EXISTING',
      message: `Issues and related data will be added to "${targetProjectName}" (${targetProjectKey}) — existing issues are kept.`,
    });
  }

  let sprintStrippedCount = 0;
  let backlogRemappedCount = 0;

  for (const issue of issues) {
    const { sprintStripped, backlogRemapped } = transformIssueForImport(
      issue,
      sourceType,
      targetType,
      statusMap,
    );
    if (sprintStripped) {
      sprintStrippedCount += 1;
    }
    if (backlogRemapped) {
      backlogRemappedCount += 1;
    }
  }

  if (
    isKanbanProject(targetType) &&
    !isKanbanProject(sourceType) &&
    sprintStrippedCount > 0
  ) {
    warnings.push({
      code: 'SPRINTS_STRIPPED',
      message: `${sprintStrippedCount} issue(s) will lose sprint assignment`,
      count: sprintStrippedCount,
    });
    dataLossItems.push('Sprint assignments and sprint history');
  }

  if (backlogRemappedCount > 0) {
    warnings.push({
      code: 'BACKLOG_REMAPPED',
      message: `${backlogRemappedCount} issue(s) will be remapped between backlog models`,
      count: backlogRemappedCount,
    });
  }

  if (isKanbanProject(targetType) && sprintCount > 0) {
    dataLossItems.push(`${sprintCount} sprint record(s) will not be imported`);
  }

  const unmapped = statusMappings.filter((m) => m.method === 'fallback');
  if (unmapped.length > 0) {
    warnings.push({
      code: 'STATUS_FALLBACK',
      message: `${unmapped.length} status(es) mapped via category fallback`,
      count: unmapped.length,
    });
  }

  const estimatedSeconds = Math.max(
    5,
    Math.ceil(issues.length / 50) * 3 + (options?.importComments ? commentCount / 100 : 0) * 2,
  );

  return {
    sourceType,
    targetType,
    sourceProjectKey,
    targetProjectKey,
    targetProjectName,
    totalIssues: issues.length,
    totalSprints: isKanbanProject(targetType) ? 0 : sprintCount,
    totalComments: options?.importComments === false ? 0 : commentCount,
    totalMembers: options?.importMembers === false ? 0 : memberCount,
    totalCustomFields: options?.importCustomFields === false ? 0 : customFieldCount,
    statusMappings,
    warnings,
    dataLossItems,
    estimatedSeconds,
  };
}

export function isValidProjectBundle(data: unknown): data is import('./types/project-bundle.types').ProjectBundle {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const bundle = data as Record<string, unknown>;
  const manifest = bundle.manifest as Record<string, unknown> | undefined;
  const version = manifest?.version;
  return (
    manifest != null &&
    typeof version === 'string' &&
    (SUPPORTED_BUNDLE_VERSIONS as readonly string[]).includes(version) &&
    typeof manifest.exportId === 'string' &&
    Array.isArray(bundle.issues) &&
    Array.isArray(bundle.statuses)
  );
}

export function normalizeLegacyBundle(
  data: import('./types/project-bundle.types').ProjectBundle,
): import('./types/project-bundle.types').ProjectBundle {
  return {
    ...data,
    project: data.project ?? {
      name: '',
      key: '',
      description: null,
      type: 'scrum',
      settings: null,
      iconUrl: null,
      color: null,
    },
    components: data.components ?? [],
    versions: data.versions ?? [],
    issueComponents: data.issueComponents ?? [],
    issueVersions: data.issueVersions ?? [],
    attachments: data.attachments ?? [],
    issueLinks: data.issueLinks ?? [],
    issueWatchers: data.issueWatchers ?? [],
    workLogs: data.workLogs ?? [],
  };
}
