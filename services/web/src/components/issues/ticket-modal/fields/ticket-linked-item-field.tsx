import { useMemo, useState } from 'react'
import { Link2, Search, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IssueLink, IssueLinkType } from '@/types'
import {
  ISSUE_LINK_TYPE_OPTIONS,
  getIssueLinkTypeLabel,
} from '@/lib/issue-link-config'
import { useIssues } from '@/hooks/useIssues'
import { useIssueLinks, useDeleteIssueLink } from '@/hooks/useIssueLinks'
import { TicketFormField } from '../ticket-form-layout'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ticketModalFieldControl } from '../ticket-modal.utils'
import type { StagedIssueLink } from '../issue-ticket-form.schema'
import type { TicketFormMode } from '../issue-ticket-form.config'

interface TicketLinkedItemFieldProps {
  projectId: string
  stagedLinks: StagedIssueLink[]
  onAdd: (link: StagedIssueLink) => void
  onRemove: (targetIssueId: string) => void
  label?: string
  mode?: TicketFormMode
  issueId?: string
  disabled?: boolean
}

function ExistingLinkRow({
  link,
  onDelete,
  isDeleting,
  disabled,
}: {
  link: IssueLink
  onDelete: (linkId: string, linkedIssueId: string) => void
  isDeleting: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
      <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground flex-shrink-0">{link.label}</span>
      <span className="text-xs font-mono text-primary flex-shrink-0">{link.issue.key}</span>
      <span className="text-sm truncate flex-1">{link.issue.title}</span>
      <button
        type="button"
        onClick={() => onDelete(link.id, link.issue.id)}
        className="text-muted-foreground hover:text-destructive flex-shrink-0"
        aria-label="Remove link"
        disabled={isDeleting || disabled}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

export function TicketLinkedItemField({
  projectId,
  stagedLinks,
  onAdd,
  onRemove,
  label,
  mode = 'create',
  issueId,
  disabled,
}: TicketLinkedItemFieldProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [linkType, setLinkType] = useState<IssueLinkType>('relates_to')

  const { data: linksData } = useIssueLinks(issueId ?? '')
  const deleteLink = useDeleteIssueLink()

  const existingLinks = useMemo(() => {
    if (!issueId || !linksData) return []
    return [...(linksData.outward ?? []), ...(linksData.inward ?? [])]
  }, [issueId, linksData])

  const linkedIssueIds = useMemo(() => {
    const ids = new Set<string>()
    if (issueId) ids.add(issueId)
    for (const link of existingLinks) ids.add(link.issue.id)
    for (const link of stagedLinks) ids.add(link.targetIssueId)
    return ids
  }, [issueId, existingLinks, stagedLinks])

  const { data: searchResults, isLoading } = useIssues({
    projectId,
    search: search.trim() || undefined,
    limit: 10,
  })

  const issues = useMemo(() => {
    const items = searchResults?.data ?? []
    return items.filter((issue) => !linkedIssueIds.has(issue.id))
  }, [searchResults, linkedIssueIds])

  const handleSelect = (issue: {
    id: string
    key: string
    title: string
  }) => {
    onAdd({
      targetIssueId: issue.id,
      targetIssueKey: issue.key,
      targetIssueTitle: issue.title,
      linkType,
    })
    setSearch('')
    setOpen(false)
  }

  const hint =
    mode === 'edit'
      ? t(
          'issues.linkedItemHintEdit',
          'New links are saved when you click Save Changes.',
        )
      : t(
          'issues.linkedItemHint',
          'Links are created after the ticket is saved.',
        )

  return (
    <TicketFormField
      label={label ?? t('issues.linkedItem', 'Linked Item')}
      hint={hint}
    >
      {existingLinks.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {existingLinks.map((link) => (
            <ExistingLinkRow
              key={link.id}
              link={link}
              onDelete={(linkId, linkedIssueId) =>
                deleteLink.mutate({ issueId: issueId!, linkId, linkedIssueId })
              }
              isDeleting={deleteLink.isPending}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {stagedLinks.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {stagedLinks.map((link) => (
            <div
              key={link.targetIssueId}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {getIssueLinkTypeLabel(link.linkType, t)}
              </span>
              <span className="text-xs font-mono text-primary flex-shrink-0">
                {link.targetIssueKey}
              </span>
              <span className="text-sm truncate flex-1">{link.targetIssueTitle}</span>
              <button
                type="button"
                onClick={() => onRemove(link.targetIssueId)}
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Remove link"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Select
          value={linkType}
          onValueChange={(v) => setLinkType(v as IssueLinkType)}
          disabled={disabled}
        >
          <SelectTrigger className={ticketModalFieldControl('w-[140px] flex-shrink-0')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_LINK_TYPE_OPTIONS.map((lt) => (
              <SelectItem key={lt.value} value={lt.value}>
                {t(lt.labelKey, lt.fallbackLabel)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                ticketModalFieldControl('flex flex-1 items-center gap-2 px-3 text-left text-muted-foreground'),
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Search className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {t(
                  'issues.linkedItemPlaceholder',
                  'Search tickets, epics, or documents to link...',
                )}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('issues.searchIssues')}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground px-1 py-1"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {isLoading && (
                <p className="px-2 py-3 text-sm text-muted-foreground text-center">
                  {t('common.loading')}
                </p>
              )}
              {!isLoading && issues.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground text-center">
                  {t('common.noResults')}
                </p>
              )}
              {issues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => handleSelect(issue)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <IssueTypeIcon type={issue.type} className="h-4 w-4 flex-shrink-0" />
                  <span className="font-mono text-xs text-primary flex-shrink-0">{issue.key}</span>
                  <span className="truncate">{issue.title}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TicketFormField>
  )
}
