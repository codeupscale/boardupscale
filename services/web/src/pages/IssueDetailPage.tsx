import { useParams } from 'react-router-dom'
import { EditIssueDialog } from '@/components/issues/ticket-modal'
import { useCloseIssueModal } from '@/lib/issue-navigation'

export function IssueDetailPage() {
  const { id: issueId } = useParams<{ id: string }>()
  const closeIssueModal = useCloseIssueModal()

  if (!issueId) {
    return null
  }

  return (
    <EditIssueDialog
      open
      issueId={issueId}
      onOpenChange={(open) => {
        if (!open) closeIssueModal()
      }}
    />
  )
}
