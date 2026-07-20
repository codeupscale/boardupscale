/**
 * Central notification type registry.
 * Add new types here when introducing events — keep string values stable (API/FE/workers).
 */
export const NOTIFICATION_TYPES = {
  ISSUE_ASSIGNED: 'issue:assigned',
  ISSUE_STATUS_CHANGED: 'issue:status_changed',
  ISSUE_PRIORITY_CHANGED: 'issue:priority_changed',
  ISSUE_DUE_DATE_CHANGED: 'issue:due_date_changed',
  ISSUE_CREATED: 'issue:created',
  ISSUE_DELETED: 'issue:deleted',
  COMMENT_CREATED: 'comment:created',
  MENTION: 'mention',
  PROJECT_CREATED: 'project:created',
  PROJECT_DELETED: 'project:deleted',
  PROJECT_MEMBER_ADDED: 'project:member_added',
  ORG_MEMBER_ADDED: 'org:member_added',
  SPRINT_STARTED: 'sprint:started',
  SPRINT_COMPLETED: 'sprint:completed',
  ISSUE_DUE_SOON: 'issue:due_soon',
  AUTOMATION: 'automation:notification',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/** Panel / API filter tabs — map to type groups for extensibility */
export const NOTIFICATION_FILTER_GROUPS = {
  all: null,
  unread: 'unread',
  mentions: [NOTIFICATION_TYPES.MENTION],
  assigned: [NOTIFICATION_TYPES.ISSUE_ASSIGNED],
} as const;

export type NotificationFilter = keyof typeof NOTIFICATION_FILTER_GROUPS;

export const DEFAULT_NOTIFICATION_PREFERENCES: {
  email: boolean;
  inApp: boolean;
  sound: boolean;
} = {
  email: true,
  inApp: true,
  sound: true,
};

/** Fan-out threshold: > this many recipients uses BullMQ */
export const NOTIFICATION_SYNC_MAX_RECIPIENTS = 1;

export const NOTIFICATION_QUEUE = 'notification';
export const NOTIFICATION_JOB_BATCH = 'notify-batch';
