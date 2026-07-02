export type SearchEntityKind = 'issue' | 'project' | 'member';

export type SearchDataSource = 'elasticsearch' | 'postgresql';

export interface SearchHighlight {
  field: string;
  snippets: string[];
}

export interface SearchIssueItem {
  kind: 'issue';
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  projectId: string;
  projectKey?: string;
  projectName?: string;
  statusName?: string;
  assigneeName?: string;
  highlights?: SearchHighlight[];
  /** Set when found via a former project key prefix (e.g. SCRUM-2 → NICE-2). */
  matchedFormerKey?: string;
}

export interface SearchProjectItem {
  kind: 'project';
  id: string;
  key: string;
  name: string;
  type: string;
  color?: string;
  iconUrl?: string;
  highlights?: SearchHighlight[];
  /** Set when the project was matched by a historical key alias. */
  matchedFormerKey?: string;
}

export interface SearchMemberItem {
  kind: 'member';
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  /** First shared project key — used for navigation from scoped search. */
  contextProjectKey?: string;
  highlights?: SearchHighlight[];
}

export type SearchResultItem = SearchIssueItem | SearchProjectItem | SearchMemberItem;

export interface SearchScope {
  orgWide: boolean;
  /** Null when org-wide; otherwise the project IDs the caller may search within. */
  accessibleProjectIds: string[] | null;
  /** Resolved project filter after access validation (undefined = no filter). */
  projectId?: string;
}

export interface GlobalSearchResult {
  issues: SearchIssueItem[];
  projects: SearchProjectItem[];
  members: SearchMemberItem[];
  totals: {
    issues: number;
    projects: number;
    members: number;
  };
  source: SearchDataSource;
}

/** @deprecated Use GlobalSearchResult — kept for similar-issue / legacy callers. */
export interface LegacyIssueSearchResult {
  items: SearchIssueItem[];
  total: number;
  source: SearchDataSource;
}
