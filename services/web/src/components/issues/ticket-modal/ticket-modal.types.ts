import type { IssueStatusCategory } from '@/types'

/** Status option shape for ticket modal status select */
export interface TicketStatusOption {
  id: string
  name: string
  color?: string
  category?: IssueStatusCategory | string
}

/** Sprint option shape for ticket modal sprint select */
export interface TicketSprintOption {
  id: string
  name: string
}

/** Uploaded attachment preview chip in create-ticket dropzone */
export interface RemoteTicketAttachment {
  id: string
  fileName: string
  mimeType?: string
  url?: string
}
