import { Issue, IssuePriority, IssueStatus, IssueStatusCategory } from '@/types'
import type { IssueTicketFormValues } from './issue-ticket-form.schema'
import { cn } from '@/lib/utils'
import { ticketModalTokens } from './ticket-modal.tokens'
import type { TicketStatusOption } from './ticket-modal.types'

/** Shared control styling for ticket modal inputs (matches Work Type select) */
export function ticketModalFieldControl(...extra: Array<string | undefined>) {
  return cn(
    ticketModalTokens.fieldSurface,
    ticketModalTokens.fieldHeight,
    ticketModalTokens.fieldFocus,
    ticketModalTokens.fieldDisabled,
    ...extra,
  )
}

export function mapTicketStatuses(
  statuses: Array<Pick<IssueStatus, 'id' | 'name' | 'color' | 'category'>> | undefined,
): TicketStatusOption[] {
  if (!statuses?.length) return []
  return statuses.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
  }))
}

export function getDefaultTodoStatusId(
  statuses: TicketStatusOption[] | undefined,
): string | undefined {
  return statuses?.find((s) => s.category === IssueStatusCategory.TODO)?.id
}

export function issueToTicketFormValues(issue: Issue): Partial<IssueTicketFormValues> {
  return {
    title: issue.title,
    description: issue.description ?? '',
    type: issue.type,
    priority: issue.priority as IssuePriority,
    statusId: issue.statusId ?? '',
    assigneeId: issue.assigneeId ?? '',
    parentId: issue.parentId ?? '',
    sprintId: issue.sprintId ?? '',
    dueDate: issue.dueDate ?? '',
  }
}
