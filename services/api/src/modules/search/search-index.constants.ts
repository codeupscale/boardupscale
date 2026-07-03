export const ISSUES_INDEX = 'boardupscale-issues';
export const PROJECTS_INDEX = 'boardupscale-projects';
export const MEMBERS_INDEX = 'boardupscale-members';

export const ISSUES_ES_MAPPING: Record<string, object> = {
  id: { type: 'keyword' },
  organizationId: { type: 'keyword' },
  projectId: { type: 'keyword' },
  projectName: { type: 'text' },
  key: { type: 'keyword' },
  number: { type: 'integer' },
  title: { type: 'text' },
  description: { type: 'text' },
  type: { type: 'keyword' },
  priority: { type: 'keyword' },
  statusName: { type: 'keyword' },
  assigneeName: { type: 'text' },
  labels: { type: 'keyword' },
  createdAt: { type: 'date' },
  updatedAt: { type: 'date' },
};

export const PROJECTS_ES_MAPPING: Record<string, object> = {
  id: { type: 'keyword' },
  organizationId: { type: 'keyword' },
  key: { type: 'keyword' },
  legacyKeys: { type: 'keyword' },
  name: { type: 'text' },
  type: { type: 'keyword' },
  color: { type: 'keyword' },
  iconUrl: { type: 'keyword' },
  status: { type: 'keyword' },
  updatedAt: { type: 'date' },
};

export const MEMBERS_ES_MAPPING: Record<string, object> = {
  id: { type: 'keyword' },
  userId: { type: 'keyword' },
  organizationId: { type: 'keyword' },
  displayName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  email: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  avatarUrl: { type: 'keyword' },
  projectIds: { type: 'keyword' },
  sampleProjectKey: { type: 'keyword' },
  updatedAt: { type: 'date' },
};

export function memberSearchDocumentId(organizationId: string, userId: string): string {
  return `${organizationId}_${userId}`;
}
