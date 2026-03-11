import { useState } from 'react'
import { Github, GitPullRequest, GitCommit, GitBranch, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { useGithubConnection, useGithubEvents } from '@/hooks/useGithub'
import type { GitHubEvent } from '@/hooks/useGithub'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime } from '@/lib/utils'

interface GitHubEventsListProps {
  issueId: string
  projectId: string
}

function PrStatusBadge({ eventType }: { eventType: GitHubEvent['eventType'] }) {
  switch (eventType) {
    case 'pr_opened':
      return <Badge variant="success">Open</Badge>
    case 'pr_merged':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          Merged
        </span>
      )
    case 'pr_closed':
      return <Badge variant="danger">Closed</Badge>
    default:
      return null
  }
}

function PrEventItem({ event }: { event: GitHubEvent }) {
  return (
    <div className="flex items-start gap-2.5 py-2 px-2 rounded-md hover:bg-gray-50 group">
      <GitPullRequest className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {event.prUrl ? (
            <a
              href={event.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-900 hover:text-blue-600 flex items-center gap-1"
            >
              {event.prTitle || 'Pull Request'}
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ) : (
            <span className="text-sm font-medium text-gray-900">
              {event.prTitle || 'Pull Request'}
            </span>
          )}
          {event.prNumber && (
            <span className="text-xs font-mono text-gray-500">#{event.prNumber}</span>
          )}
          <PrStatusBadge eventType={event.eventType} />
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          {event.author && <span>{event.author}</span>}
          {event.author && <span>&middot;</span>}
          <span>{formatRelativeTime(event.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}

function CommitEventItem({ event }: { event: GitHubEvent }) {
  const shortSha = event.commitSha ? event.commitSha.slice(0, 7) : null

  return (
    <div className="flex items-start gap-2.5 py-2 px-2 rounded-md hover:bg-gray-50">
      <GitCommit className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {shortSha && (
            <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {shortSha}
            </span>
          )}
          {event.branchName && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <GitBranch className="h-3 w-3" />
              {event.branchName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          {event.author && <span>{event.author}</span>}
          {event.author && <span>&middot;</span>}
          <span>{formatRelativeTime(event.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}

export function GitHubEventsList({ issueId, projectId }: GitHubEventsListProps) {
  const [isOpen, setIsOpen] = useState(true)
  const { data: connection, isLoading: connectionLoading } = useGithubConnection(projectId)
  const { data: events } = useGithubEvents(issueId)

  // Don't render at all if no connection for the project
  if (connectionLoading) return null
  if (!connection) return null

  const sortedEvents = events
    ? [...events].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : []

  return (
    <div>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 mb-2 group text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        )}
        <Github className="h-4 w-4 text-gray-700 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">
          GitHub Activity
        </span>
        {sortedEvents.length > 0 && (
          <span className="text-xs font-normal text-gray-500">({sortedEvents.length})</span>
        )}
      </button>

      {isOpen && (
        <>
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-gray-500 pl-5">No GitHub activity linked to this issue.</p>
          ) : (
            <div className="space-y-0.5 pl-1">
              {sortedEvents.map((event) =>
                event.eventType === 'commit' ? (
                  <CommitEventItem key={event.id} event={event} />
                ) : (
                  <PrEventItem key={event.id} event={event} />
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
