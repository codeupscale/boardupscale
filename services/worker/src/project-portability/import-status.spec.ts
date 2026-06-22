import {
  buildImportStatusColumns,
  isKanbanSourceBacklogColumn,
  resolveTargetStatusId,
} from './import-status';

describe('import-status', () => {
  const scrumStatuses = [
    {
      sourceId: '1',
      name: 'To Do',
      category: 'todo',
      color: '#6B7280',
      position: 0,
      isDefault: true,
      wipLimit: 0,
    },
    {
      sourceId: '2',
      name: 'In Progress',
      category: 'in_progress',
      color: '#3B82F6',
      position: 1,
      isDefault: false,
      wipLimit: 0,
    },
    {
      sourceId: '3',
      name: 'QA',
      category: 'in_progress',
      color: '#8B5CF6',
      position: 2,
      isDefault: false,
      wipLimit: 2,
    },
    {
      sourceId: '4',
      name: 'Done',
      category: 'done',
      color: '#10B981',
      position: 3,
      isDefault: false,
      wipLimit: 0,
    },
  ];

  const preview = {
    statusMappings: [
      { sourceName: 'To Do', targetName: 'To Do', targetCategory: 'todo' },
      { sourceName: 'In Progress', targetName: 'In Progress', targetCategory: 'in_progress' },
      { sourceName: 'QA', targetName: 'QA', targetCategory: 'in_progress' },
      { sourceName: 'Done', targetName: 'Done', targetCategory: 'done' },
    ],
  };

  it('creates QA column from preview mappings', () => {
    const columns = buildImportStatusColumns(scrumStatuses, preview, 'scrum');
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['To Do', 'In Progress', 'QA', 'Done']),
    );
    expect(columns.find((c) => c.name === 'QA')?.wipLimit).toBe(2);
  });

  it('does not treat sprintless scrum todo as kanban backlog column', () => {
    expect(isKanbanSourceBacklogColumn('scrum', 'To Do')).toBe(false);
    expect(isKanbanSourceBacklogColumn('kanban', 'Backlog')).toBe(true);
  });

  it('resolves issue status by source name', () => {
    const statusRows = [
      { id: 'a', name: 'QA', category: 'in_progress' },
      { id: 'b', name: 'Done', category: 'done' },
    ];
    const map = new Map([
      ['QA', 'a'],
      ['Done', 'b'],
      ['__default__', 'a'],
    ]);

    expect(
      resolveTargetStatusId(
        { statusName: 'QA', statusCategory: 'in_progress', sprintSourceId: null },
        'scrum',
        'kanban',
        map,
        statusRows,
      ),
    ).toBe('a');
  });
});
