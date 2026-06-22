import {
  buildImportPreview,
  buildImportStatusColumns,
  buildStatusMappings,
  transformIssueForImport,
} from './project-bundle.transformer';
import { PROJECT_TYPE } from '../projects/project-type';
import { BundleIssue, BundleStatus } from './types/project-bundle.types';

const SCRUM_STATUSES: BundleStatus[] = [
  { sourceId: '1', name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true, wipLimit: 0 },
  { sourceId: '2', name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false, wipLimit: 0 },
  { sourceId: '3', name: 'In Review', category: 'in_progress', color: '#F59E0B', position: 2, isDefault: false, wipLimit: 0 },
  { sourceId: '4', name: 'Done', category: 'done', color: '#10B981', position: 3, isDefault: false, wipLimit: 0 },
];

const KANBAN_STATUSES: BundleStatus[] = [
  { sourceId: '1', name: 'Backlog', category: 'todo', color: '#9CA3AF', position: 0, isDefault: true, wipLimit: 0 },
  { sourceId: '2', name: 'To Do', category: 'todo', color: '#6B7280', position: 1, isDefault: false, wipLimit: 0 },
  { sourceId: '3', name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false, wipLimit: 0 },
  { sourceId: '4', name: 'Review', category: 'in_progress', color: '#F59E0B', position: 3, isDefault: false, wipLimit: 0 },
  { sourceId: '5', name: 'Done', category: 'done', color: '#10B981', position: 4, isDefault: false, wipLimit: 0 },
];

function makeIssue(overrides: Partial<BundleIssue> = {}): BundleIssue {
  return {
    sourceId: 'issue-1',
    sourceKey: 'PROJ-1',
    number: 1,
    title: 'Test',
    description: null,
    type: 'task',
    priority: 'medium',
    statusSourceId: '1',
    statusName: 'To Do',
    statusCategory: 'todo',
    sprintSourceId: null,
    sprintName: null,
    parentSourceId: null,
    assigneeEmail: null,
    reporterEmail: 'user@example.com',
    storyPoints: null,
    timeEstimate: null,
    timeSpent: 0,
    dueDate: null,
    labels: [],
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProjectBundleTransformer', () => {
  it('maps In Review to Review for scrum → kanban', () => {
    const mappings = buildStatusMappings(
      SCRUM_STATUSES,
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
    );
    const reviewMap = mappings.find((m) => m.sourceName === 'In Review');
    expect(reviewMap?.targetName).toBe('Review');
    expect(reviewMap?.method).toBe('alias');
  });

  it('maps scrum issues by status column, not sprint membership (scrum → kanban)', () => {
    const mappings = buildStatusMappings(
      SCRUM_STATUSES,
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
    );
    const statusMap = new Map(mappings.map((m) => [m.sourceName, m.targetName]));

    const sprinted = transformIssueForImport(
      makeIssue({ sprintSourceId: 'sprint-1', statusName: 'In Progress' }),
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
      statusMap,
    );
    expect(sprinted.sprintStripped).toBe(true);
    expect(sprinted.transformed.sprintSourceId).toBeNull();
    expect(sprinted.transformed.targetStatusName).toBe('In Progress');

    const sprintlessTodo = transformIssueForImport(
      makeIssue({ sprintSourceId: null, statusName: 'To Do' }),
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
      statusMap,
    );
    expect(sprintlessTodo.backlogRemapped).toBe(false);
    expect(sprintlessTodo.transformed.targetStatusName).toBe('To Do');
  });

  it('keeps In Progress / Done on sprintless scrum issues when importing to kanban', () => {
    const mappings = buildStatusMappings(
      SCRUM_STATUSES,
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
    );
    const statusMap = new Map(mappings.map((m) => [m.sourceName, m.targetName]));

    const inProgress = transformIssueForImport(
      makeIssue({ sprintSourceId: null, statusName: 'In Progress', statusCategory: 'in_progress' }),
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
      statusMap,
    );
    expect(inProgress.backlogRemapped).toBe(false);
    expect(inProgress.transformed.targetStatusName).toBe('In Progress');

    const done = transformIssueForImport(
      makeIssue({ sprintSourceId: null, statusName: 'Done', statusCategory: 'done' }),
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
      statusMap,
    );
    expect(done.backlogRemapped).toBe(false);
    expect(done.transformed.targetStatusName).toBe('Done');
  });

  it('creates import columns from source workflow including custom QA', () => {
    const withQa = [
      ...SCRUM_STATUSES,
      {
        sourceId: '5',
        name: 'QA',
        category: 'in_progress' as const,
        color: '#8B5CF6',
        position: 4,
        isDefault: false,
        wipLimit: 3,
      },
    ];
    const columns = buildImportStatusColumns(
      withQa,
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.SCRUM,
    );
    expect(columns.some((c) => c.name === 'QA')).toBe(true);
    expect(columns.find((c) => c.name === 'QA')?.wipLimit).toBe(3);
  });

  it('maps kanban Backlog column to scrum To Do backlog', () => {
    const mappings = buildStatusMappings(
      KANBAN_STATUSES,
      PROJECT_TYPE.KANBAN,
      PROJECT_TYPE.SCRUM,
    );
    const statusMap = new Map(mappings.map((m) => [m.sourceName, m.targetName]));

    const result = transformIssueForImport(
      makeIssue({ statusName: 'Backlog' }),
      PROJECT_TYPE.KANBAN,
      PROJECT_TYPE.SCRUM,
      statusMap,
    );
    expect(result.backlogRemapped).toBe(true);
    expect(result.transformed.targetStatusName).toBe('To Do');
    expect(result.transformed.sprintSourceId).toBeNull();
  });

  it('preview includes sprint strip warning for scrum → kanban', () => {
    const preview = buildImportPreview(
      PROJECT_TYPE.SCRUM,
      PROJECT_TYPE.KANBAN,
      'SCRUM',
      'KAN',
      'Kanban Import',
      SCRUM_STATUSES,
      [makeIssue({ sprintSourceId: 's1' }), makeIssue({ sprintSourceId: null })],
      2,
      0,
      0,
      0,
    );
    expect(preview.warnings.some((w) => w.code === 'SPRINTS_STRIPPED')).toBe(true);
    expect(preview.dataLossItems.length).toBeGreaterThan(0);
  });
});
