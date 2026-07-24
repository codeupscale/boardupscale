import { useCallback, type RefObject } from 'react'
import type { IssueTicketFormHandle } from './issue-ticket-form'

/**
 * Shared create/edit ticket-modal close contract.
 *
 * Flow (must stay acyclic):
 *   X / Escape / overlay / footer Cancel
 *     → requestFormClose()
 *       → form.requestClose()  (dirty-check; may show discard confirm)
 *         → onCancel prop (= handleCancel)
 *           → onOpenChange(false)
 *
 * If the form is not mounted (loading / unavailable), close directly.
 * Never wire handleCancel back into requestClose — that loops and freezes the modal.
 */
export function useTicketModalClose(
  formRef: RefObject<IssueTicketFormHandle | null>,
  isBusy: boolean,
  onOpenChange: (open: boolean) => void,
) {
  /** Real close — only after dirty-check (or when no form). */
  const handleCancel = useCallback(() => {
    if (isBusy) return
    onOpenChange(false)
  }, [isBusy, onOpenChange])

  /** Entry point for Cancel / X / Escape / overlay. */
  const requestFormClose = useCallback(() => {
    if (formRef.current) {
      formRef.current.requestClose()
      return
    }
    handleCancel()
  }, [formRef, handleCancel])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        requestFormClose()
        return
      }
      onOpenChange(true)
    },
    [onOpenChange, requestFormClose],
  )

  return { handleCancel, requestFormClose, handleOpenChange }
}
