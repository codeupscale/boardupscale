import { useState } from 'react'
import { Copy, Check, Link } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { toast } from '@/store/ui.store'
import { IssueType } from '@/types'
import { cn } from '@/lib/utils'
import { issueDetailUrl } from '@/lib/routes'

const TYPE_LABELS: Record<IssueType, string> = {
  [IssueType.EPIC]: 'Epic',
  [IssueType.STORY]: 'Story',
  [IssueType.TASK]: 'Task',
  [IssueType.BUG]: 'Bug',
  [IssueType.SUBTASK]: 'Subtask',
}

interface CopyTicketLinkProps {
  issueKey: string
  issueId: string
  issueType?: IssueType
  className?: string
  done?: boolean
}

function CopyLinkPopoverContent({ issueId, issueType }: { issueId: string; issueType?: IssueType }) {
  const [copied, setCopied] = useState(false)
  const link = issueDetailUrl(issueId)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for insecure contexts or permission denial
      toast('Could not access clipboard. Copy the link manually.', 'error')
    }
  }

  return (
    <div className="p-3 flex flex-col gap-2 w-[280px]">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Copy ticket link
        </p>
        {issueType && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <IssueTypeIcon type={issueType} className="h-3 w-3" />
            {TYPE_LABELS[issueType]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 bg-muted rounded-md px-2 py-1.5">
        <Link className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-foreground truncate flex-1 font-mono select-all">{link}</span>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'flex items-center justify-center gap-1.5 w-full rounded-md px-3 py-1.5',
          'text-xs font-medium transition-colors',
          copied
            ? 'bg-green-500 text-white'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  )
}

export function CopyTicketLink({ issueKey, issueId, issueType, className, done }: CopyTicketLinkProps) {
  return (
    <Tooltip
      content={<CopyLinkPopoverContent issueId={issueId} issueType={issueType} />}
      side="bottom"
      align="start"
      sideOffset={6}
      stopPropagation
      className="rounded-lg border shadow-lg p-0"
    >
      <span
        className={cn(
          'text-[10px] font-mono font-medium text-primary tracking-wide',
          'hover:underline cursor-pointer',
          done && 'line-through opacity-60',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {issueKey}
      </span>
    </Tooltip>
  )
}
