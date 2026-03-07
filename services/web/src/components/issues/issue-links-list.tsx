import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Plus, X, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIssueLinks, useCreateIssueLink, useDeleteIssueLink } from '@/hooks/useIssueLinks'
import { useIssues } from '@/hooks/useIssues'
import { IssueLink, IssueLinkType } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/issues/status-badge'

const LINK_TYPE_LABELS: Record<string, string> = {
  blocks: 'blocks',
  is_blocked_by: 'is blocked by',
  duplicates: 'duplicates',
  is_duplicated_by: 'is duplicated by',
  relates_to: 'relates to',
}

const CREATABLE_LINK_TYPES: Array<{ value: IssueLinkType; label: string }> = [
  { value: 'blocks', label: 'Blocks' },
  { value: 'duplicates', label: 'Duplicates' },
  { value: 'relates_to', label: 'Relates to' },
]

interface IssueLinkGroupProps {
  linkType: string
  links: IssueLink[]
  issueId: string
}

function IssueLinkGroup({ linkType, links, issueId }: IssueLinkGroupProps) {
  const deleteLink = useDeleteIssueLink()
  const label = LINK_TYPE_LABELS[linkType] || linkType

  return (
    <div className="mb-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </h4>
      <div className="space-y-1">
        {links.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <Link
              to={`/issues/${link.issue.id}`}
              className="flex items-center gap-2 flex-1 min-w-0"
            >
              <span className="text-xs font-mono text-blue-600 font-medium whitespace-nowrap">
                {link.issue.key}
              </span>
              <span className="text-sm text-gray-700 truncate">
                {link.issue.title}
              </span>
              {link.issue.status && (
                <StatusBadge status={link.issue.status} />
              )}
            </Link>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
              onClick={() => deleteLink.mutate({ issueId, linkId: link.id })}
              title="Remove link"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

interface AddLinkDialogProps {
  open: boolean
  onClose: () => void
  issueId: string
  projectId: string
}

function AddLinkDialog({ open, onClose, issueId, projectId }: AddLinkDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [linkType, setLinkType] = useState<IssueLinkType>('relates_to')
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const createLink = useCreateIssueLink()

  const { data: issuesData } = useIssues({
    projectId,
    search: search.length >= 2 ? search : undefined,
    limit: 10,
  })

  const issues = (issuesData as any)?.data || issuesData || []
  const issueList = Array.isArray(issues) ? issues : []
  const filteredIssues = issueList.filter((i: any) => i.id !== issueId)

  const handleSubmit = () => {
    if (!selectedIssueId) return
    createLink.mutate(
      { issueId, targetIssueId: selectedIssueId, linkType },
      {
        onSuccess: () => {
          onClose()
          setSearch('')
          setSelectedIssueId(null)
          setLinkType('relates_to')
        },
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <DialogHeader onClose={onClose}>
        <DialogTitle>{t('issues.addLink', 'Add Link')}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4">
        {/* Link type selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            {t('issues.linkType', 'Link Type')}
          </label>
          <select
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as IssueLinkType)}
          >
            {CREATABLE_LINK_TYPES.map((lt) => (
              <option key={lt.value} value={lt.value}>
                {lt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Issue search */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            {t('issues.targetIssue', 'Target Issue')}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedIssueId(null)
              }}
              placeholder={t('issues.searchIssues', 'Search issues...')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {search.length >= 2 && filteredIssues.length > 0 && !selectedIssueId && (
            <div className="mt-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
              {filteredIssues.map((issue: any) => (
                <button
                  key={issue.id}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                  onClick={() => {
                    setSelectedIssueId(issue.id)
                    setSearch(`${issue.key} - ${issue.title}`)
                  }}
                >
                  <span className="font-mono text-blue-600 text-xs font-medium">{issue.key}</span>
                  <span className="truncate text-gray-700">{issue.title}</span>
                </button>
              ))}
            </div>
          )}
          {search.length >= 2 && filteredIssues.length === 0 && !selectedIssueId && (
            <p className="text-xs text-gray-400 mt-1">{t('common.noResults', 'No results found')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!selectedIssueId}
            isLoading={createLink.isPending}
            onClick={handleSubmit}
          >
            {t('issues.addLink', 'Add Link')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface IssueLinksSectionProps {
  issueId: string
  projectId: string
}

export function IssueLinksList({ issueId, projectId }: IssueLinksSectionProps) {
  const { t } = useTranslation()
  const { data: links } = useIssueLinks(issueId)
  const [showDialog, setShowDialog] = useState(false)

  // Group links by type
  const grouped: Record<string, IssueLink[]> = {}
  if (links) {
    for (const link of links) {
      if (!grouped[link.linkType]) grouped[link.linkType] = []
      grouped[link.linkType].push(link)
    }
  }

  const hasLinks = links && links.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Link2 className="h-4 w-4" />
          {t('issues.linkedIssues', 'Linked Issues')}
          {hasLinks && (
            <span className="text-gray-400 font-normal">({links.length})</span>
          )}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowDialog(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t('issues.addLink', 'Add Link')}
        </Button>
      </div>

      {hasLinks ? (
        Object.entries(grouped).map(([linkType, groupLinks]) => (
          <IssueLinkGroup
            key={linkType}
            linkType={linkType}
            links={groupLinks}
            issueId={issueId}
          />
        ))
      ) : (
        <p className="text-sm text-gray-400">{t('issues.noLinks', 'No linked issues.')}</p>
      )}

      <AddLinkDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        issueId={issueId}
        projectId={projectId}
      />
    </div>
  )
}
