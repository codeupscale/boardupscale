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

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum SprintStatus {
  PLANNED = 'planning',
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
  status?: IssueStatus
  assignee?: User
  reporter?: User
  parent?: Issue
  sprint?: Sprint
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
  uploaderId: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  storageKey: string
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
}

export interface BoardData {
  statuses: BoardColumn[]
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
