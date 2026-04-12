export enum IssueType {
  EPIC = 'epic',
  STORY = 'story',
  TASK = 'task',
  BUG = 'bug',
  SUBTASK = 'subtask',
}

export enum IssuePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  NONE = 'none',
}

export enum IssueStatusCategory {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

export enum ProjectType {
  SCRUM = 'scrum',
  KANBAN = 'kanban',
}

export enum ProjectTemplate {
  SCRUM = 'scrum',
  KANBAN = 'kanban',
  BUG_TRACKING = 'bug-tracking',
  BLANK = 'blank',
  CAMPAIGN_MANAGEMENT = 'campaign-management',
  CONTENT_CALENDAR = 'content-calendar',
  SALES_PIPELINE = 'sales-pipeline',
  RECRUITMENT = 'recruitment',
  ONBOARDING = 'onboarding',
  IT_SERVICE = 'it-service',
  TASK_TRACKING = 'task-tracking',
}

export type TemplateCategory = 'all' | 'software' | 'marketing' | 'sales' | 'hr' | 'operations'

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum SprintStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

export interface Organization {
  id: string
  name: string
  slug: string
  settings: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface OrganizationMembership {
  id: string
  organizationId: string
  organization: Organization
  role: string
  isDefault: boolean
  createdAt: string
}

export interface User {
  id: string
  organizationId: string
  email: string
  displayName: string
  avatarUrl?: string
  timezone: string
  language: string
  role: UserRole
  isActive: boolean
  emailVerified: boolean
  twoFaEnabled: boolean
  jiraAccountId?: string | null
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  organizationId: string
  name: string
  key: string
  description?: string
  type: ProjectType
  status: string
  ownerId?: string
  owner?: User
  settings: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface ProjectMember {
  id: string
  projectId: string
  userId: string
  user: User
  role: string
  createdAt: string
}

export interface IssueStatus {
  id: string
  projectId: string
  name: string
  category: IssueStatusCategory
  position: number
  color: string
  wipLimit: number
  createdAt: string
  updatedAt: string
}

export interface Sprint {
  id: string
  projectId: string
  name: string
  goal?: string
  status: SprintStatus
  startDate?: string
  endDate?: string
  createdAt: string
  updatedAt: string
}

export interface Issue {
  id: string
  organizationId: string
  projectId: string
  sprintId?: string
  parentId?: string
  statusId?: string
  assigneeId?: string
  reporterId: string
  number: number
  key: string
  title: string
  description?: string
  type: IssueType
  priority: IssuePriority
  dueDate?: string
  storyPoints?: number
  timeEstimate?: number
  timeSpent: number
  labels: string[]
  position: number
  project?: { id: string; name: string; key: string }
  status?: IssueStatus
  assignee?: User
  reporter?: User
  parent?: Issue
  sprint?: Sprint
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  issueId: string
  authorId: string
  content: string
  editedAt?: string
  author?: User
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id: string
  issueId?: string
  commentId?: string
  uploadedBy: string
  fileName: string
  fileSize: number
  mimeType: string
  storageKey: string
  storageBucket: string
  uploader?: User
  createdAt: string
}

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  body?: string
  data: Record<string, any>
  read: boolean
  createdAt: string
}

export interface WorkLog {
  id: string
  issueId: string
  userId: string
  timeSpent: number
  description?: string
  loggedAt: string
  user?: User
  createdAt: string
}

export interface BoardColumn extends IssueStatus {
  issues: Issue[]
  total: number
  hasMore: boolean
}

export interface BoardData {
  statuses: BoardColumn[]
}

export interface ColumnPageResult {
  issues: Issue[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

export interface BoardFilters {
  assigneeId?: string
  type?: string
  priority?: string
  label?: string
  search?: string
  sprintId?: string
}

export type SwimlaneGroupBy = 'none' | 'assignee' | 'priority' | 'type' | 'epic'

export interface SwimlaneGroup {
  key: string
  label: string
  issues: Issue[]
  avatarUrl?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface Webhook {
  id: string
  organizationId: string
  projectId?: string
  name: string
  url: string
  secret?: string
  events: string[]
  isActive: boolean
  headers: Record<string, string>
  createdBy?: string
  creator?: User
  createdAt: string
  updatedAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventType: string
  payload: Record<string, any>
  responseStatus?: number
  responseBody?: string
  responseHeaders?: Record<string, any>
  durationMs?: number
  status: 'pending' | 'success' | 'failed'
  attempt: number
  nextRetryAt?: string
  createdAt: string
}

export const WEBHOOK_EVENT_TYPES = [
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'issue.assigned',
  'issue.status_changed',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'sprint.started',
  'sprint.completed',
  'project.created',
  'project.updated',
  'member.added',
  'member.removed',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

export interface ApiResponse<T> {
  data: T
}

export interface Permission {
  id: string
  resource: string
  action: string
  description?: string
  createdAt: string
}

export interface Role {
  id: string
  organizationId: string | null
  name: string
  description?: string
  isSystem: boolean
  permissions: Permission[]
  createdAt: string
  updatedAt: string
}

export interface UserPermission {
  resource: string
  action: string
}

// Custom Fields
export type CustomFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'checkbox'
  | 'user'

export interface CustomFieldOption {
  label: string
  value: string
  color?: string
}

export interface CustomFieldDefinition {
  id: string
  organizationId: string
  projectId?: string
  name: string
  fieldKey: string
  fieldType: CustomFieldType
  description?: string
  isRequired: boolean
  defaultValue?: any
  options?: CustomFieldOption[]
  position: number
  createdAt: string
  updatedAt: string
}

export interface CustomFieldValue {
  id: string
  issueId: string
  fieldId: string
  value: any
  field?: CustomFieldDefinition
  createdAt: string
  updatedAt: string
}

// Components
export interface ProjectComponent {
  id: string
  projectId: string
  name: string
  description?: string
  leadId?: string
  lead?: User
  createdAt: string
  updatedAt: string
}

// Versions
export enum VersionStatus {
  UNRELEASED = 'unreleased',
  RELEASED = 'released',
  ARCHIVED = 'archived',
}

export interface ProjectVersion {
  id: string
  projectId: string
  name: string
  description?: string
  status: string
  startDate?: string
  releaseDate?: string
  releasedAt?: string
  createdAt: string
  updatedAt: string
}

export interface IssueVersion {
  issueId: string
  versionId: string
  relationType: string
  version?: ProjectVersion
}

export interface VersionProgress {
  total: number
  done: number
  inProgress: number
  todo: number
}

// Issue Links
export type IssueLinkType = 'blocks' | 'is_blocked_by' | 'duplicates' | 'is_duplicated_by' | 'relates_to'

export interface IssueLink {
  id: string
  linkType: IssueLinkType
  label: string
  issue: Issue
}

export interface IssueLinkData {
  outward: IssueLink[]
  inward: IssueLink[]
}

// Issue Watchers
export interface IssueWatcherUser {
  userId: string
  displayName: string
  avatarUrl?: string
  email: string
  createdAt: string
}

export interface WatchersData {
  watchers: IssueWatcherUser[]
  count: number
}

export interface ToggleWatchResult {
  watching: boolean
  watcherCount: number
}

export interface AutomationRule {
  id: string
  organizationId: string
  projectId: string
  name: string
  description?: string
  isActive: boolean
  triggerType: string
  triggerConfig: Record<string, any>
  conditions: any[]
  actions: any[]
  executionCount: number
  lastExecutedAt?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface AutomationLog {
  id: string
  ruleId: string
  issueId?: string
  triggerEvent: string
  actionsExecuted: any[]
  status: string
  errorMessage?: string
  executedAt: string
}

// Activities (issue changelog)
export interface Activity {
  id: string
  orgId: string
  issueId: string
  userId: string
  action: string
  field?: string
  oldValue?: string
  newValue?: string
  metadata?: Record<string, any>
  user?: User
  createdAt: string
}

// Saved Views
export interface SavedViewFilters {
  search?: string
  type?: string
  priority?: string
  statusId?: string
  assigneeId?: string
  sprintId?: string
}

export interface SavedView {
  id: string
  organizationId: string
  projectId: string
  creatorId: string
  name: string
  filters: SavedViewFilters
  isShared: boolean
  creator?: { id: string; displayName: string; avatarUrl?: string }
  createdAt: string
  updatedAt: string
}

// Audit Logs
export interface AuditLog {
  id: string
  orgId: string
  userId?: string
  action: string
  entityType: string
  entityId?: string
  changes?: Record<string, any>
  ipAddress?: string
  user?: User
  createdAt: string
}

// Chat
export interface ChatConversation {
  id: string
  organizationId: string
  projectId: string
  userId: string
  title: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
  messages?: ChatMessage[]
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  tokensUsed: number
  metadata?: Record<string, any>
  createdAt: string
}
