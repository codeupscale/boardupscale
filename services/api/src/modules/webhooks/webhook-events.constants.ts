export enum WebhookEventType {
  ISSUE_CREATED = 'issue.created',
  ISSUE_UPDATED = 'issue.updated',
  ISSUE_DELETED = 'issue.deleted',
  ISSUE_ASSIGNED = 'issue.assigned',
  ISSUE_STATUS_CHANGED = 'issue.status_changed',

  COMMENT_CREATED = 'comment.created',
  COMMENT_UPDATED = 'comment.updated',
  COMMENT_DELETED = 'comment.deleted',

  SPRINT_STARTED = 'sprint.started',
  SPRINT_COMPLETED = 'sprint.completed',

  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',

  MEMBER_ADDED = 'member.added',
  MEMBER_REMOVED = 'member.removed',
}

export const ALL_WEBHOOK_EVENTS = Object.values(WebhookEventType);
