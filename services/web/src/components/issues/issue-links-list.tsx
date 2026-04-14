import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Plus, X, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIssueLinks, useCreateIssueLink, useDeleteIssueLink } from '@/hooks/useIssueLinks'
import { useIssues } from '@/hooks/useIssues'
import { IssueLink, IssueLinkType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { StatusBadge } from '@/components/issues/status-badge'

const LINK_TYPES: { value: IssueLinkType; label: string }[] = [
  { value: 'blocks', label: 'Blocks' },
  { value: 'is_blocked_by', label: 'Is blocked by' },
  { value: 'duplicates', label: 'Duplicates' },
  { value: 'is_duplicated_by', label: 'Is duplicated by' },
  { value: 'relates_to', label: 'Relates to' },
]

function LinkItem({
  link,
  issueId,
  onDelete,
  isDeleting,
}: {
  link: IssueLink
  issueId: string
  onDelete: (linkId: string) => void
  isDeleting: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent group">
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0 truncate" title={link.label}>
        {link.label}
      </span>
      <Link
        to={`/issues/${link.issue.id}`}
        className="flex items-center gap-2 min-w-0 flex-1 hover:text-primary"
      >
        <span className="text-xs font-mono text-primary flex-shrink-0">
          {link.issue.key}
        </span>
        <span className="text-sm text-foreground/80 truncate">{link.issue.title}</span>
      </Link>
      {link.issue.status && <StatusBadge status={link.issue.status} />}
      <button
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 flex-shrink-0 transition-opacity"
        onClick={() => onDelete(link.id)}
        disabled={isDeleting}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function IssueLinksList({ issueId, projectId }: { issueId: string; projectId?: string }) {
  const { t } = useTranslation()
  const { data: linksData } = useIssueLinks(issueId)
  const createLink = useCreateIssueLink()
  const deleteLink = useDeleteIssueLink()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLinkType, setSelectedLinkType] = useState<IssueLinkType>('relates_to')
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)

  const { data: searchResults } = useIssues({
    search: searchTerm,
    projectId: projectId,
    limit: 10,
  })

  const allLinks = [
    ...(linksData?.outward || []),
    ...(linksData?.inward || []),
  ]

  // Group links by type
  const grouped = allLinks.reduce<Record<string, IssueLink[]>>((acc, link) => {
    const key = link.label
    if (!acc[key]) acc[key] = []
    acc[key].push(link)
    return acc
  }, {})

  const handleDelete = (linkId: string) => {
    deleteLink.mutate({ issueId, linkId })
  }

  const handleCreate = () => {
    if (!selectedIssueId) return
    createLink.mutate(
      { issueId, targetIssueId: selectedIssueId, linkType: selectedLinkType },
      {
        onSuccess: () => {
          setShowAddDialog(false)
          setSearchTerm('')
          setSelectedIssueId(null)
          setSelectedLinkType('relates_to')
        },
      },
    )
  }

  const searchedIssues = (searchResults as any)?.data || searchResults || []
  const issueList = Array.isArray(searchedIssues) ? searchedIssues : []

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5">
          <Link2 className="h-4 w-4" />
          {t('issues.linkedIssues', 'Linked Issues')}
          {allLinks.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({allLinks.length})</span>
          )}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t('issues.addLink', 'Link')}
        </Button>
      </div>

      {allLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('issues.noLinks', 'No linked issues.')}</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([label, links]) => (
            <div key={label}>
              <div className="space-y-0.5">
                {links.map((link) => (
                  <LinkItem
                    key={link.id}
                    link={link}
                    issueId={issueId}
                    onDelete={handleDelete}
                    isDeleting={deleteLink.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Link Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowAddDialog(false)
            setSearchTerm('')
            setSelectedIssueId(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('issues.linkIssue', 'Link Issue')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Link type selector */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('issues.linkType', 'Link Type')}
              </label>
              <Select value={selectedLinkType} onValueChange={(v) => setSelectedLinkType(v as IssueLinkType)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_TYPES.map((lt) => (
                    <SelectItem key={lt.value} value={lt.value}>
                      {lt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Issue search */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('issues.searchIssues', 'Search Issues')}
              </label>
              <Input
                placeholder={t('issues.searchIssues', 'Search by title or key...')}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setSelectedIssueId(null)
                }}
              />
            </div>

            {/* Search results */}
            {searchTerm.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {issueList.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground text-center">
                    {t('common.noResults', 'No results found')}
                  </p>
                ) : (
                  issueList
                    .filter((i: any) => i.id !== issueId)
                    .map((i: any) => (
                      <button
                        key={i.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 flex items-center gap-2 transition-colors ${
                          selectedIssueId === i.id ? 'bg-primary/10 ring-1 ring-primary/50' : ''
                        }`}
                        onClick={() => setSelectedIssueId(i.id)}
                      >
                        <span className="font-mono text-primary text-xs flex-shrink-0">
                          {i.key}
                        </span>
                        <span className="truncate text-foreground/80">{i.title}</span>
                      </button>
                    ))
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false)
                  setSearchTerm('')
                  setSelectedIssueId(null)
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                disabled={!selectedIssueId}
                isLoading={createLink.isPending}
                onClick={handleCreate}
              >
                {t('issues.addLink', 'Link')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
