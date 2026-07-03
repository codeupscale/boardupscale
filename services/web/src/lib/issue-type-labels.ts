import type { TFunction } from 'i18next'
import { IssueType } from '@/types'

const ISSUE_TYPE_I18N_KEYS: Record<IssueType, string> = {
  [IssueType.EPIC]: 'issues.epic',
  [IssueType.STORY]: 'issues.story',
  [IssueType.TASK]: 'issues.task',
  [IssueType.BUG]: 'issues.bug',
  [IssueType.SUBTASK]: 'issues.subtask',
}

/** Localized display label for an issue type — single source of truth for breadcrumbs, selects, etc. */
export function getIssueTypeLabel(type: IssueType | string, t: TFunction): string {
  const key = ISSUE_TYPE_I18N_KEYS[type as IssueType]
  return key ? t(key) : type
}
