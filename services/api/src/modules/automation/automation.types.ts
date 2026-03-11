export enum TriggerType {
  ISSUE_CREATED = 'issue.created',
  ISSUE_UPDATED = 'issue.updated',
  ISSUE_STATUS_CHANGED = 'issue.status_changed',
  ISSUE_ASSIGNED = 'issue.assigned',
  ISSUE_PRIORITY_CHANGED = 'issue.priority_changed',
  COMMENT_ADDED = 'comment.added',
  SPRINT_STARTED = 'sprint.started',
  SPRINT_COMPLETED = 'sprint.completed',
  SCHEDULE = 'schedule',
}

export enum ActionType {
  SET_FIELD = 'set_field',
  ASSIGN_USER = 'assign_user',
  TRANSITION_STATUS = 'transition',
  ADD_LABEL = 'add_label',
  REMOVE_LABEL = 'remove_label',
  ADD_COMMENT = 'add_comment',
  SEND_NOTIFICATION = 'notify',
  MOVE_TO_SPRINT = 'move_sprint',
  AI_ASSIGN = 'ai_assign',
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  IN = 'in',
  NOT_IN = 'not_in',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
}

export interface AutomationCondition {
  field: string;
  operator: ConditionOperator;
  value?: any;
}

export interface AutomationAction {
  type: ActionType;
  config: Record<string, any>;
}

export interface TriggerContext {
  issueId?: string;
  issue?: any;
  previousValues?: Record<string, any>;
  userId?: string;
  commentId?: string;
  sprintId?: string;
}
