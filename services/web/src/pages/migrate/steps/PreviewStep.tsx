import { useEffect, useState, useMemo } from 'react'
import {
  CheckSquare,
  Square,
  Loader2,
  FileText,
  Users,
  Layers,
  Search,
  FolderOpen,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  usePreviewMigration,
  useMigrationMembers,
  useMigrationProjects,
  PreviewProject,
  JiraMember,
} from '@/hooks/useMigration'
import { ConnectJiraResult } from '@/hooks/useMigration'

interface PreviewStepProps {
  runId: string
  connectResult: ConnectJiraResult
  connectionId?: string
  onNext: (selectedKeys: string[], preview: PreviewProject[], selectedMemberIds: string[]) => void
  onBack: () => void
}

const PROJECT_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
]

function getGradient(key: string) {
  const idx = key.charCodeAt(0) % PROJECT_GRADIENTS.length
  return PROJECT_GRADIENTS[idx]
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
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
  const [membersInitialised, setMembersInitialised] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')

  const previewMutation = usePreviewMigration()
  const membersQuery = useMigrationMembers(connectionId ?? null)
  const projectsQuery = useMigrationProjects(
    connectResult.projects.length === 0 && connectionId ? connectionId : null,
  )

  const availableProjects =
    connectResult.projects.length > 0 ? connectResult.projects : (projectsQuery.data ?? [])

  // Auto-fetch preview when we have a project list
  useEffect(() => {
    const allKeys = availableProjects.map((p) => p.key)
    if (allKeys.length > 0) {
      previewMutation.mutate({ runId, projectKeys: allKeys })
    }
  }, [runId, availableProjects.length]) // eslint-disable-line

  // Auto-select all projects when loaded
  useEffect(() => {
    if (previewMutation.data?.projects && previewMutation.data.projects.length > 0) {
      const allKeys = previewMutation.data.projects.map((p: PreviewProject) => p.key)
      setSelectedKeys(new Set(allKeys))
    }
  }, [previewMutation.data?.projects?.length]) // eslint-disable-line

  // Auto-select all members when loaded
  useEffect(() => {
    if (membersQuery.data && !membersInitialised) {
      setSelectedMemberIds(new Set(membersQuery.data.map((m) => m.accountId)))
      setMembersInitialised(true)
    }
  }, [membersQuery.data, membersInitialised])

  const projects = previewMutation.data?.projects ?? []
  const isLoading = previewMutation.isPending || projectsQuery.isLoading

  const enrichedProjects = projects.map((p: PreviewProject) => {
    const conn = availableProjects.find((cp) => cp.key === p.key)
    return { ...p, name: conn?.name || p.name || p.key }
  })

  const members: JiraMember[] = membersQuery.data ?? []

  // Filtered lists
  const filteredProjects = useMemo(() => {
    const q = projectSearch.toLowerCase()
    if (!q) return enrichedProjects
    return enrichedProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
    )
  }, [enrichedProjects, projectSearch])

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q),
    )
  }, [members, memberSearch])

  // Summary
  const selectedProjects = enrichedProjects.filter((p) => selectedKeys.has(p.key))
  const totalIssues = selectedProjects.reduce((s, p) => s + p.issueCount, 0)
  const estimatedMinutes = Math.max(1, Math.ceil(totalIssues / 100))

  const allProjectsSelected =
    enrichedProjects.length > 0 && selectedKeys.size === enrichedProjects.length
  const allMembersSelected = members.length > 0 && selectedMemberIds.size === members.length

  function toggleProject(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleMember(accountId: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
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
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          What would you like to import?
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Select the projects and team members to migrate into Boardupscale.
        </p>
      </div>

      {/* Projects Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* Section header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <FolderOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Projects</span>
            {!isLoading && enrichedProjects.length > 0 && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                {selectedKeys.size} / {enrichedProjects.length}
              </span>
            )}
          </div>
          {!isLoading && enrichedProjects.length > 0 && (
            <button
              onClick={() =>
                allProjectsSelected
                  ? setSelectedKeys(new Set())
                  : setSelectedKeys(new Set(enrichedProjects.map((p) => p.key)))
              }
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
            >
              {allProjectsSelected ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        <div className="p-3">
          {/* Search */}
          {!isLoading && enrichedProjects.length > 3 && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 text-gray-900 dark:text-white placeholder:text-gray-400"
              />
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="space-y-2.5 p-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 animate-pulse">
                  <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!isLoading && filteredProjects.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-400">
              {projectSearch ? 'No projects match your search.' : 'No projects found in this Jira instance.'}
            </div>
          )}

          {/* Project list */}
          {!isLoading && filteredProjects.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredProjects.map((project) => {
                const isSelected = selectedKeys.has(project.key)
                const gradient = getGradient(project.key)
                return (
                  <div
                    key={project.key}
                    onClick={() => toggleProject(project.key)}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === ' ' && toggleProject(project.key)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 group',
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500/50 dark:ring-blue-600/50'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                    )}
                  >
                    {/* Gradient key badge */}
                    <div className={cn(
                      'h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-sm',
                      gradient,
                    )}>
                      <span className="text-white text-xs font-bold">
                        {project.key.slice(0, 2)}
                      </span>
                    </div>

                    {/* Name + key */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {project.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                        {project.key}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {project.issueCount.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {project.sprintCount}
                      </span>
                    </div>

                    {/* Checkbox */}
                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="h-5 w-5 text-gray-300 dark:text-gray-600 group-hover:text-gray-400" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Members Section */}
      {connectionId && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {/* Section header */}
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Team Members
              </span>
              {!membersQuery.isLoading && members.length > 0 && (
                <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">
                  {selectedMemberIds.size} / {members.length}
                </span>
              )}
            </div>
            {!membersQuery.isLoading && members.length > 0 && (
              <button
                onClick={() =>
                  allMembersSelected
                    ? setSelectedMemberIds(new Set())
                    : setSelectedMemberIds(new Set(members.map((m) => m.accountId)))
                }
                className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors"
              >
                {allMembersSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          <div className="p-3">
            {/* Search */}
            {!membersQuery.isLoading && members.length > 5 && (
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-600 text-gray-900 dark:text-white placeholder:text-gray-400"
                />
              </div>
            )}

            {/* Loading */}
            {membersQuery.isLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                      <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty */}
            {!membersQuery.isLoading && filteredMembers.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-400">
                {memberSearch
                  ? 'No members match your search.'
                  : 'No members found in this Jira instance.'}
              </div>
            )}

            {/* Members grid */}
            {!membersQuery.isLoading && filteredMembers.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
                {filteredMembers.map((member) => {
                  const isSelected = selectedMemberIds.has(member.accountId)
                  return (
                    <div
                      key={member.accountId}
                      onClick={() => toggleMember(member.accountId)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === ' ' && toggleMember(member.accountId)}
                      className={cn(
                        'flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all duration-150 group',
                        isSelected
                          ? 'bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-500/50 dark:ring-violet-600/50'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                      )}
                    >
                      {/* Avatar */}
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.displayName}
                          className="h-9 w-9 rounded-full flex-shrink-0 object-cover ring-2 ring-white dark:ring-gray-800"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement
                            el.style.display = 'none'
                            el.nextElementSibling?.classList.remove('hidden')
                          }}
                        />
                      ) : null}
                      <div
                        className={cn(
                          'h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-violet-500 to-purple-600 ring-2 ring-white dark:ring-gray-800',
                          member.avatarUrl ? 'hidden' : '',
                        )}
                      >
                        {getInitials(member.displayName)}
                      </div>

                      {/* Name + email */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                          {member.displayName}
                        </p>
                        {member.email && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {member.email}
                          </p>
                        )}
                      </div>

                      {/* Check */}
                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400" />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Bar */}
      {selectedKeys.size > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white shadow-lg shadow-blue-500/20">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Projects</p>
              <p className="text-white text-lg font-bold mt-0.5">{selectedKeys.size}</p>
            </div>
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Issues</p>
              <p className="text-white text-lg font-bold mt-0.5">{totalIssues.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Members</p>
              <p className="text-white text-lg font-bold mt-0.5">{selectedMemberIds.size}</p>
            </div>
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Est. Time</p>
              <p className="text-white text-lg font-bold mt-0.5 flex items-center justify-center gap-1">
                <Zap className="h-3.5 w-3.5" />
                ~{estimatedMinutes}m
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-1">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={selectedKeys.size === 0 || isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            `Continue with ${selectedKeys.size} project${selectedKeys.size !== 1 ? 's' : ''}`
          )}
        </Button>
      </div>
    </div>
  )
}
