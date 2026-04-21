import { AlertTriangle, GitMerge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MergePreview } from '@/hooks/useOrganization'

interface Props {
  open: boolean
  preview: MergePreview | null
  loading: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function MergeConfirmationModal({ open, preview, loading, error, onConfirm, onCancel }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-card rounded-2xl shadow-xl border border-border w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <GitMerge className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Merge Accounts</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        {preview ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              The email <strong className="text-foreground">{preview.targetUser?.email}</strong> already
              belongs to an existing member. Merging will transfer all activity from{' '}
              <strong className="text-foreground">{preview.placeholder.displayName}</strong> (Jira
              placeholder) to this account.
            </p>

            {/* Impact summary */}
            <div className="bg-muted/50 rounded-xl border border-border p-4 mb-4 grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Issues</span>
              <span className="font-medium text-foreground text-right">{preview.impact.issuesReassigned}</span>
              <span className="text-muted-foreground">Comments</span>
              <span className="font-medium text-foreground text-right">{preview.impact.commentsReassigned}</span>
              <span className="text-muted-foreground">Project memberships</span>
              <span className="font-medium text-foreground text-right">{preview.impact.projectMemberships}</span>
              <span className="text-muted-foreground">Work logs</span>
              <span className="font-medium text-foreground text-right">{preview.impact.worklogsReassigned}</span>
              <span className="text-muted-foreground">Watchers</span>
              <span className="font-medium text-foreground text-right">{preview.impact.watchersReassigned}</span>
            </div>

            {preview.conflict && (
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This user is already a member of this organization. Their data will still be merged.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-5">This cannot be undone.</p>
          </>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!preview || loading}
            isLoading={loading}
          >
            Confirm Merge →
          </Button>
        </div>
      </div>
    </div>
  )
}
