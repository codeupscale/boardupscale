import { IssueType } from '@/types'
import { childTypeAllowsParent } from '@/components/issues/parent-issue-select'
import { isSprintEligibleIssueType } from '@/lib/project-workflow'

export type TicketFormMode = 'create' | 'edit'

export type TicketFieldType =
  | 'type'
  | 'status'
  | 'title'
  | 'description'
  | 'assignee'
  | 'labels'
  | 'priority'
  | 'sprint'
  | 'parent'
  | 'dueDate'
  | 'reporter'
  | 'attachments'
  | 'linkedItem'

export type TicketFieldGrid = 'full' | 'half'

/** Half-width column in the 2-column form grid */
export type TicketFieldColumn = 'left' | 'right'

export interface TicketFormContext {
  mode: TicketFormMode
  watchedType: IssueType | string
  statusesCount: number
  /** When true, sprint field is hidden (Kanban projects) */
  isKanban: boolean
}

export interface TicketFieldConfig {
  id: string
  type: TicketFieldType
  labelKey: string
  grid: TicketFieldGrid
  /** Half-width fields only — defaults to left when omitted */
  column?: TicketFieldColumn
  required?: boolean
  visible?: (ctx: TicketFormContext) => boolean
}

export interface TicketFormRowConfig {
  id: string
  fields: TicketFieldConfig[]
}

function isFieldVisible(field: TicketFieldConfig, ctx: TicketFormContext): boolean {
  if (field.visible && !field.visible(ctx)) return false
  return true
}

export function getVisibleFormRows(ctx: TicketFormContext): TicketFormRowConfig[] {
  return CREATE_TICKET_FORM_ROWS.map((row) => ({
    ...row,
    fields: row.fields.filter((f) => isFieldVisible(f, ctx)),
  })).filter((row) => row.fields.length > 0)
}

/** @deprecated Use getVisibleFormRows */
export function getVisibleCreateFormRows(ctx: Omit<TicketFormContext, 'mode'>): TicketFormRowConfig[] {
  return getVisibleFormRows({ ...ctx, mode: 'create' })
}

export const CREATE_TICKET_FORM_ROWS: TicketFormRowConfig[] = [
  {
    id: 'type-status',
    fields: [
      {
        id: 'type',
        type: 'type',
        labelKey: 'issues.workType',
        grid: 'half',
        required: true,
      },
      {
        id: 'status',
        type: 'status',
        labelKey: 'common.status',
        grid: 'half',
        visible: (ctx) =>
          ctx.statusesCount > 0 &&
          !(ctx.mode === 'edit' && ctx.watchedType === IssueType.EPIC),
      },
    ],
  },
  {
    id: 'title',
    fields: [
      {
        id: 'title',
        type: 'title',
        labelKey: 'issues.summaryTitle',
        grid: 'full',
        required: true,
      },
    ],
  },
  {
    id: 'description',
    fields: [
      {
        id: 'description',
        type: 'description',
        labelKey: 'common.description',
        grid: 'full',
      },
    ],
  },
  {
    id: 'assignee-priority',
    fields: [
      {
        id: 'assignee',
        type: 'assignee',
        labelKey: 'common.assignee',
        grid: 'half',
        column: 'left',
      },
      {
        id: 'priority',
        type: 'priority',
        labelKey: 'common.priority',
        grid: 'half',
        column: 'right',
        required: true,
        visible: (ctx) =>
          !(ctx.mode === 'edit' && ctx.watchedType === IssueType.EPIC),
      },
    ],
  },
  {
    id: 'parent-sprint',
    fields: [
      {
        id: 'parent',
        type: 'parent',
        labelKey: 'issues.parent',
        grid: 'half',
        column: 'left',
        visible: (ctx) => childTypeAllowsParent(ctx.watchedType),
      },
      {
        id: 'sprint',
        type: 'sprint',
        labelKey: 'issues.sprint',
        grid: 'half',
        column: 'right',
        visible: (ctx) =>
          !ctx.isKanban && isSprintEligibleIssueType({ type: ctx.watchedType }),
      },
    ],
  },
  {
    id: 'dueDate-labels',
    fields: [
      {
        id: 'dueDate',
        type: 'dueDate',
        labelKey: 'issues.dueDate',
        grid: 'half',
        column: 'left',
      },
      {
        id: 'labels',
        type: 'labels',
        labelKey: 'issues.labels',
        grid: 'half',
        column: 'right',
      },
    ],
  },
  {
    id: 'reporter',
    fields: [
      {
        id: 'reporter',
        type: 'reporter',
        labelKey: 'common.reporter',
        grid: 'half',
      },
    ],
  },
  {
    id: 'attachments',
    fields: [
      {
        id: 'attachments',
        type: 'attachments',
        labelKey: 'common.attachments',
        grid: 'full',
      },
    ],
  },
  {
    id: 'linkedItem',
    fields: [
      {
        id: 'linkedItem',
        type: 'linkedItem',
        labelKey: 'issues.linkedItem',
        grid: 'full',
      },
    ],
  },
]
