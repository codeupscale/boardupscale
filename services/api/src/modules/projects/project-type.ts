export const PROJECT_TYPE = {
  SCRUM: 'scrum',
  KANBAN: 'kanban',
} as const;

export type ProjectTypeValue = (typeof PROJECT_TYPE)[keyof typeof PROJECT_TYPE];

export function isKanbanProject(type?: string | null): boolean {
  return type === PROJECT_TYPE.KANBAN;
}
