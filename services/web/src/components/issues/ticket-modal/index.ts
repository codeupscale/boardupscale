export { TicketModal, TicketModalBody } from './ticket-modal'
export { TicketModalHeader } from './ticket-modal-header'
export { TicketModalFooter } from './ticket-modal-footer'
export { ticketModalTokens } from './ticket-modal.tokens'
export {
  TICKET_ATTACHMENT_MAX_BYTES,
  TOP_LEVEL_ISSUE_TYPES,
} from './ticket-modal.constants'

export type { TicketStatusOption, TicketSprintOption, RemoteTicketAttachment } from './ticket-modal.types'

export { IssueTicketForm } from './issue-ticket-form'
export type { IssueTicketFormHandle, IssueTicketFormProps } from './issue-ticket-form'

export { CreateIssueDialog } from './create-issue-dialog'
export type { CreateIssueDialogProps, CreateIssueFormHandle } from './create-issue-dialog'

export { EditIssueDialog } from './edit-issue-dialog'
export type { EditIssueDialogProps } from './edit-issue-dialog'

export { TicketActivityTabs } from './ticket-activity-tabs'

export {
  issueTicketFormSchema,
  type IssueTicketFormValues,
  type IssueTicketFormPayload,
  type StagedIssueLink,
} from './issue-ticket-form.schema'

export {
  getVisibleFormRows,
  getVisibleCreateFormRows,
  type TicketFormMode,
  type TicketFieldConfig,
  type TicketFormContext,
} from './issue-ticket-form.config'

export { useIssueTicketForm } from './use-issue-ticket-form'

export {
  mapTicketStatuses,
  getDefaultTodoStatusId,
  resolveCreateTicketDefaults,
  hasRichTextContent,
  extractAttachmentIdsFromHtml,
  stripAttachmentFromHtml,
  extractMediaFromHtml,
  stripInlineMediaFromHtml,
  ticketModalFieldControl,
  issueToTicketFormValues,
} from './ticket-modal.utils'
