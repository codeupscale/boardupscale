import { z } from 'zod'
import { IssueType, IssuePriority, IssueLinkType } from '@/types'

export const issueTicketFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().optional(),
  type: z.nativeEnum(IssueType),
  priority: z.nativeEnum(IssuePriority),
  statusId: z.string().optional(),
  assigneeId: z.string().optional(),
  sprintId: z.string().optional(),
  parentId: z.string().optional(),
  dueDate: z.string().optional(),
})

export type IssueTicketFormValues = z.infer<typeof issueTicketFormSchema>

export interface StagedIssueLink {
  targetIssueId: string
  targetIssueKey: string
  targetIssueTitle: string
  linkType: IssueLinkType
}

export interface IssueTicketFormPayload extends IssueTicketFormValues {
  labels: string[]
}

export function cleanIssueTicketPayload(
  values: IssueTicketFormValues,
  labels: string[],
): IssueTicketFormPayload {
  const cleaned = Object.fromEntries(
    Object.entries(values).filter(
      ([, v]) => v !== '' && v !== null && v !== undefined,
    ),
  ) as IssueTicketFormValues

  return {
    ...cleaned,
    labels,
  }
}

export const defaultIssueTicketFormValues: Partial<IssueTicketFormValues> = {
  type: IssueType.TASK,
  priority: IssuePriority.MEDIUM,
  description: '',
}
