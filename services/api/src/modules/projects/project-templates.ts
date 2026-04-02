import { ProjectTemplate } from './dto/create-project.dto';

export interface TemplateStatus {
  name: string;
  category: string;
  color: string;
  position: number;
  isDefault: boolean;
}

export interface TemplateDefinition {
  name: string;
  description: string;
  templateCategory: 'software' | 'marketing' | 'sales' | 'hr' | 'operations';
  statuses: TemplateStatus[];
}

export const PROJECT_TEMPLATES: Record<string, TemplateDefinition> = {
  // ── Software ───────────────────────────────────────────────
  [ProjectTemplate.SCRUM]: {
    name: 'Scrum',
    description: 'Agile scrum workflow with sprints, backlog, and review stages',
    templateCategory: 'software',
    statuses: [
      { name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'In Review', category: 'in_progress', color: '#F59E0B', position: 2, isDefault: false },
      { name: 'Done', category: 'done', color: '#10B981', position: 3, isDefault: false },
    ],
  },
  [ProjectTemplate.KANBAN]: {
    name: 'Kanban',
    description: 'Continuous flow Kanban board with backlog and review stages',
    templateCategory: 'software',
    statuses: [
      { name: 'Backlog', category: 'todo', color: '#9CA3AF', position: 0, isDefault: true },
      { name: 'To Do', category: 'todo', color: '#6B7280', position: 1, isDefault: false },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false },
      { name: 'Review', category: 'in_progress', color: '#F59E0B', position: 3, isDefault: false },
      { name: 'Done', category: 'done', color: '#10B981', position: 4, isDefault: false },
    ],
  },
  [ProjectTemplate.BUG_TRACKING]: {
    name: 'Bug Tracking',
    description: 'Bug lifecycle workflow from report to verification',
    templateCategory: 'software',
    statuses: [
      { name: 'Open', category: 'todo', color: '#EF4444', position: 0, isDefault: true },
      { name: 'Confirmed', category: 'todo', color: '#F97316', position: 1, isDefault: false },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false },
      { name: 'Fixed', category: 'in_progress', color: '#8B5CF6', position: 3, isDefault: false },
      { name: 'Verified', category: 'done', color: '#10B981', position: 4, isDefault: false },
      { name: 'Closed', category: 'done', color: '#6B7280', position: 5, isDefault: false },
    ],
  },

  // ── Marketing ──────────────────────────────────────────────
  [ProjectTemplate.CAMPAIGN_MANAGEMENT]: {
    name: 'Campaign Management',
    description: 'Plan, execute, and launch marketing campaigns',
    templateCategory: 'marketing',
    statuses: [
      { name: 'Backlog', category: 'todo', color: '#9CA3AF', position: 0, isDefault: true },
      { name: 'Planning', category: 'todo', color: '#6B7280', position: 1, isDefault: false },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false },
      { name: 'Review & Approval', category: 'in_progress', color: '#F59E0B', position: 3, isDefault: false },
      { name: 'Launched', category: 'done', color: '#10B981', position: 4, isDefault: false },
    ],
  },
  [ProjectTemplate.CONTENT_CALENDAR]: {
    name: 'Content Calendar',
    description: 'Manage content from ideation through publication',
    templateCategory: 'marketing',
    statuses: [
      { name: 'Ideation', category: 'todo', color: '#8B5CF6', position: 0, isDefault: true },
      { name: 'Draft', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'Review', category: 'in_progress', color: '#F59E0B', position: 2, isDefault: false },
      { name: 'Approved', category: 'done', color: '#10B981', position: 3, isDefault: false },
      { name: 'Published', category: 'done', color: '#059669', position: 4, isDefault: false },
    ],
  },

  // ── Sales ──────────────────────────────────────────────────
  [ProjectTemplate.SALES_PIPELINE]: {
    name: 'Sales Pipeline',
    description: 'Track deals from prospect to close',
    templateCategory: 'sales',
    statuses: [
      { name: 'Prospect', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'Qualification', category: 'todo', color: '#8B5CF6', position: 1, isDefault: false },
      { name: 'Proposal', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false },
      { name: 'Negotiation', category: 'in_progress', color: '#F59E0B', position: 3, isDefault: false },
      { name: 'Won', category: 'done', color: '#10B981', position: 4, isDefault: false },
      { name: 'Lost', category: 'done', color: '#EF4444', position: 5, isDefault: false },
    ],
  },

  // ── HR ─────────────────────────────────────────────────────
  [ProjectTemplate.RECRUITMENT]: {
    name: 'Recruitment',
    description: 'Manage candidates from application to hiring',
    templateCategory: 'hr',
    statuses: [
      { name: 'Applied', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'Screening', category: 'todo', color: '#8B5CF6', position: 1, isDefault: false },
      { name: 'Interview', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false },
      { name: 'Offer', category: 'in_progress', color: '#F59E0B', position: 3, isDefault: false },
      { name: 'Hired', category: 'done', color: '#10B981', position: 4, isDefault: false },
      { name: 'Rejected', category: 'done', color: '#EF4444', position: 5, isDefault: false },
    ],
  },
  [ProjectTemplate.ONBOARDING]: {
    name: 'Employee Onboarding',
    description: 'Track new hire onboarding tasks and progress',
    templateCategory: 'hr',
    statuses: [
      { name: 'Not Started', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'Completed', category: 'done', color: '#10B981', position: 2, isDefault: false },
    ],
  },

  // ── Operations ─────────────────────────────────────────────
  [ProjectTemplate.IT_SERVICE]: {
    name: 'IT Service Management',
    description: 'Manage incidents, requests, and changes',
    templateCategory: 'operations',
    statuses: [
      { name: 'Open', category: 'todo', color: '#EF4444', position: 0, isDefault: true },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'Waiting', category: 'in_progress', color: '#F59E0B', position: 2, isDefault: false },
      { name: 'Resolved', category: 'done', color: '#10B981', position: 3, isDefault: false },
      { name: 'Closed', category: 'done', color: '#6B7280', position: 4, isDefault: false },
    ],
  },
  [ProjectTemplate.TASK_TRACKING]: {
    name: 'Task Tracking',
    description: 'Simple task board for any team',
    templateCategory: 'operations',
    statuses: [
      { name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'Done', category: 'done', color: '#10B981', position: 2, isDefault: false },
    ],
  },
};

/** Blank fallback statuses (used when template key is not found) */
export const BLANK_STATUSES: TemplateStatus[] = [
  { name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
  { name: 'Done', category: 'done', color: '#10B981', position: 1, isDefault: false },
];
