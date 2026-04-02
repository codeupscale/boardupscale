import { useEffect, useState } from 'react'
import {
  CheckSquare,
  Square,
  Loader2,
  Clock,
  FileText,
  Users,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePreviewMigration, useMigrationMembers, PreviewProject, JiraMember } from '@/hooks/useMigration'
import { ConnectJiraResult } from '@/hooks/useMigration'

interface PreviewStepProps {
  runId: string
  connectResult: ConnectJiraResult
  connectionId?: string
  onNext: (selectedKeys: string[], preview: PreviewProject[], selectedMemberIds: string[]) => void
  onBack: () => void
}

export function PreviewStep({
  runId,
  connectResult,
  connectionId,
  onNext,
  onBack,
}: PreviewStepProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [membersExpanded, setMembersExpanded] = useState(false)
  const [membersInitialised, setMembersInitialised] = useState(false)

  const previewMutation = usePreviewMigration()
  const membersQuery = useMigrationMembers(connectionId ?? null)

  // Auto-fetch preview on mount with all available project keys
  useEffect(() => {
    const allKeys = connectResult.projects.map((p) => p.key)
    // If projects came back from OAuth they may be empty — skip until we have keys
    if (allKeys.length > 0) {
      previewMutation.mutate({ runId, projectKeys: allKeys })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // Pre-select all members when the list first loads
  useEffect(() => {
    if (membersQuery.data && !membersInitialised) {
      setSelectedMemberIds(new Set(membersQuery.data.map((m) => m.accountId)))
      setMembersInitialised(true)
    }
  }, [membersQuery.data, membersInitialised])

  const projects = previewMutation.data?.projects ?? []
  const isLoading = previewMutation.isPending

  // Merge project names from connectResult into preview data
  const enrichedProjects = projects.map((p) => {
    const conn = connectResult.projects.find((cp) => cp.key === p.key)
    return { ...p, name: conn?.name || p.name || p.key }
  })

  const selectedProjects = enrichedProjects.filter((p) => selectedKeys.has(p.key))
  const totalIssues = selectedProjects.reduce((s, p) => s + p.issueCount, 0)
  const totalSprints = selectedProjects.reduce((s, p) => s + p.sprintCount, 0)
  const estimatedMinutes = Math.max(1, Math.ceil(totalIssues / 100))

  const members: JiraMember[] = membersQuery.data ?? []
  const allMembersSelected =
    members.length > 0 && selectedMemberIds.size === members.length

  // ── Projects ────────────────────────────────────────────────────────────────

  function toggleProject(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAllProjects() {
    setSelectedKeys(new Set(enrichedProjects.map((p) => p.key)))
  }

  function deselectAllProjects() {
    setSelectedKeys(new Set())
  }

  const allProjectsSelected =
    enrichedProjects.length > 0 && selectedKeys.size === enrichedProjects.length

  // ── Members ─────────────────────────────────────────────────────────────────

  function toggleMember(accountId: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  function selectAllMembers() {
    setSelectedMemberIds(new Set(members.map((m) => m.accountId)))
  }

  function deselectAllMembers() {
    setSelectedMemberIds(new Set())
  }

  function handleContinue() {
    const memberIds = allMembersSelected ? [] : Array.from(selectedMemberIds)
    onNext(
      Array.from(selectedKeys),
      enrichedProjects.filter((p) => selectedKeys.has(p.key)),
      memberIds,
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Select Projects to Migrate
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose the Jira projects you want to import into Boardupscale.
        </p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Project list */}
      {!isLoading && enrichedProjects.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {enrichedProjects.length} projects available
            </span>
            <button
              onClick={allProjectsSelected ? deselectAllProjects : selectAllProjects}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {allProjectsSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {enrichedProjects.map((project) => {
              const isSelected = selectedKeys.has(project.key)
              return (
                <Card
                  key={project.key}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
                      : 'hover:border-gray-300 dark:hover:border-gray-600',
                  )}
                  onClick={() => toggleProject(project.key)}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === ' ' && toggleProject(project.key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      ) : (
                        <Square className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white truncate">
                            {project.name}
                          </span>
                          <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded flex-shrink-0">
                            {project.key}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {project.issueCount.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" />
                          {project.sprintCount}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* ── Team Members section ── */}
      {connectionId && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setMembersExpanded((v) => !v)}
            className="w-full flex items-center justify-between p-4 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-expanded={membersExpanded}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Team Members
              </span>
              {members.length > 0 && (
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                  {selectedMemberIds.size} / {members.length}
                </span>
              )}
            </div>
            {membersExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {membersExpanded && (
            <div className="p-4 space-y-3">
              {membersQuery.isLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!membersQuery.isLoading && members.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No members found. They may be restricted by your Jira admin settings.
                </p>
              )}

              {!membersQuery.isLoading && members.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {members.length} members found
                    </span>
                    <button
                      onClick={allMembersSelected ? deselectAllMembers : selectAllMembers}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {allMembersSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {members.map((member) => {
                      const isSelected = selectedMemberIds.has(member.accountId)
                      return (
                        <div
                          key={member.accountId}
                          onClick={() => toggleMember(member.accountId)}
                          className={cn(
                            'flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors',
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                          )}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === ' ' && toggleMember(member.accountId)}
                        >
                          {/* Avatar */}
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.displayName}
                              className="h-8 w-8 rounded-full flex-shrink-0 object-cover"
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                {member.displayName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Name + email */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {member.displayName}
                            </p>
                            {member.email && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {member.email}
                              </p>
                            )}
                          </div>

                          {/* Checkbox indicator */}
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary bar */}
      {selectedKeys.size > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Projects
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1">
                  {selectedKeys.size}
                </p>
              </div>
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Issues
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1">
                  {totalIssues.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Sprints
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1">{totalSprints}</p>
              </div>
              <div>
                <p className="text-blue-600 dark:text-blue-400 text-xs font-medium uppercase tracking-wide">
                  Est. Time
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mt-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  ~{estimatedMinutes}m
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleContinue} disabled={selectedKeys.size === 0}>
          Continue
        </Button>
      </div>
    </div>
  )
}
