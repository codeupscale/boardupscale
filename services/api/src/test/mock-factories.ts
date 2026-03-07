import { User } from '../modules/users/entities/user.entity';
import { Organization } from '../modules/organizations/entities/organization.entity';
import { Project } from '../modules/projects/entities/project.entity';
import { ProjectMember } from '../modules/projects/entities/project-member.entity';
import { Issue } from '../modules/issues/entities/issue.entity';
import { IssueStatus } from '../modules/issues/entities/issue-status.entity';
import { WorkLog } from '../modules/issues/entities/work-log.entity';
import { Sprint } from '../modules/sprints/entities/sprint.entity';
import { Comment } from '../modules/comments/entities/comment.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';
import { Attachment } from '../modules/files/entities/attachment.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = '33333333-3333-3333-3333-333333333333';
const ISSUE_ID = '44444444-4444-4444-4444-444444444444';
const STATUS_ID = '55555555-5555-5555-5555-555555555555';
const SPRINT_ID = '66666666-6666-6666-6666-666666666666';
const COMMENT_ID = '77777777-7777-7777-7777-777777777777';
const NOTIFICATION_ID = '88888888-8888-8888-8888-888888888888';
const ATTACHMENT_ID = '99999999-9999-9999-9999-999999999999';
const REFRESH_TOKEN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

export function mockOrganization(overrides?: Partial<Organization>): Organization {
  const org = new Organization();
  Object.assign(org, {
    id: ORG_ID,
    name: 'Test Organization',
    slug: 'test-organization',
    settings: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
  return org;
}

export function mockUser(overrides?: Partial<User>): User {
  const user = new User();
  Object.assign(user, {
    id: USER_ID,
    organizationId: ORG_ID,
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    passwordHash: '$2b$12$hashedpassword',
    role: 'member',
    isActive: true,
    emailVerified: false,
    timezone: 'UTC',
    language: 'en',
    lastLoginAt: null,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    notificationPreferences: { email: true, inApp: true },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
  return user;
}

export function mockProject(overrides?: Partial<Project>): Project {
  const project = new Project();
  Object.assign(project, {
    id: PROJECT_ID,
    organizationId: ORG_ID,
    name: 'Test Project',
    key: 'TPROJ',
    description: 'A test project',
    type: 'software',
    status: 'active',
    iconUrl: null,
    color: '#3B82F6',
    ownerId: USER_ID,
    nextIssueNumber: 1,
    settings: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
  return project;
}

export function mockProjectMember(overrides?: Partial<ProjectMember>): ProjectMember {
  const member = new ProjectMember();
  Object.assign(member, {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    projectId: PROJECT_ID,
    userId: USER_ID,
    role: 'developer',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  });
  return member;
}

export function mockIssueStatus(overrides?: Partial<IssueStatus>): IssueStatus {
  const status = new IssueStatus();
  Object.assign(status, {
    id: STATUS_ID,
    projectId: PROJECT_ID,
    name: 'To Do',
    category: 'todo',
    color: '#6B7280',
    position: 0,
    isDefault: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
  return status;
}

export function mockIssue(overrides?: Partial<Issue>): Issue {
  const issue = new Issue();
  Object.assign(issue, {
    id: ISSUE_ID,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    sprintId: null,
    statusId: STATUS_ID,
    reporterId: USER_ID,
    assigneeId: null,
    parentId: null,
    number: 1,
    key: 'TPROJ-1',
    title: 'Test Issue',
    description: 'A test issue description',
    type: 'task',
    priority: 'medium',
    storyPoints: null,
    timeEstimate: null,
    timeSpent: 0,
    dueDate: null,
    labels: [],
    position: 1,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
  return issue;
}

export function mockWorkLog(overrides?: Partial<WorkLog>): WorkLog {
  const log = new WorkLog();
  Object.assign(log, {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    issueId: ISSUE_ID,
    userId: USER_ID,
    timeSpent: 3600,
    description: 'Worked on implementation',
    loggedAt: new Date('2024-01-15'),
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    ...overrides,
  });
  return log;
}

export function mockSprint(overrides?: Partial<Sprint>): Sprint {
  const sprint = new Sprint();
  Object.assign(sprint, {
    id: SPRINT_ID,
    projectId: PROJECT_ID,
    name: 'Sprint 1',
    goal: 'Complete authentication module',
    status: 'planned',
    startDate: null,
    endDate: null,
    completedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
  return sprint;
}

export function mockComment(overrides?: Partial<Comment>): Comment {
  const comment = new Comment();
  Object.assign(comment, {
    id: COMMENT_ID,
    issueId: ISSUE_ID,
    authorId: USER_ID,
    content: 'This is a test comment',
    deletedAt: null,
    editedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
  return comment;
}

export function mockNotification(overrides?: Partial<Notification>): Notification {
  const notification = new Notification();
  Object.assign(notification, {
    id: NOTIFICATION_ID,
    userId: USER_ID,
    type: 'issue:assigned',
    title: 'You have been assigned to TPROJ-1',
    body: 'Test Issue',
    data: { issueId: ISSUE_ID, projectId: PROJECT_ID },
    readAt: null,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  });
  return notification;
}

export function mockAttachment(overrides?: Partial<Attachment>): Attachment {
  const attachment = new Attachment();
  Object.assign(attachment, {
    id: ATTACHMENT_ID,
    issueId: ISSUE_ID,
    commentId: null,
    uploadedBy: USER_ID,
    fileName: 'test-file.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    storageKey: 'uuid-test-file.pdf',
    storageBucket: 'projectflow',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  });
  return attachment;
}

export function mockRefreshToken(overrides?: Partial<RefreshToken>): RefreshToken {
  const token = new RefreshToken();
  Object.assign(token, {
    id: REFRESH_TOKEN_ID,
    userId: USER_ID,
    tokenHash: 'hashed-token-value',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  });
  return token;
}

// Common IDs for cross-referencing in tests
export const TEST_IDS = {
  ORG_ID,
  USER_ID,
  PROJECT_ID,
  ISSUE_ID,
  STATUS_ID,
  SPRINT_ID,
  COMMENT_ID,
  NOTIFICATION_ID,
  ATTACHMENT_ID,
  REFRESH_TOKEN_ID,
};
