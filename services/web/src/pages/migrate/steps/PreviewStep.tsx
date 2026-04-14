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
  Filter,
  X,
  Mail,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  onNext: (selectedKeys: string[], preview: PreviewProject[], selectedMemberIds: string[] | undefined) => void
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

const MEMBER_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-500',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-emerald-600',
]

type SelectionFilter = 'all' | 'selected' | 'unselected'

function getGradient(key: string, gradients = PROJECT_GRADIENTS) {
  const idx = key.charCodeAt(0) % gradients.length
  return gradients[idx]
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ─── Filter Pill ──────────────────────────────────────────────────────────────

function FilterPill({
  value,
  current,
  label,
  count,
  color,
  onChange,
}: {
  value: SelectionFilter
  current: SelectionFilter
  label: string
  count: number
  color: 'blue' | 'violet'
  onChange: (v: SelectionFilter) => void
}) {
  const active = value === current
  const colorMap = {
    blue: active
      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 dark:shadow-primary/40'
      : 'bg-muted text-muted-foreground hover:bg-accent',
    violet: active
      ? 'bg-violet-600 text-white shadow-sm shadow-violet-200 dark:shadow-violet-900/40'
      : 'bg-muted text-muted-foreground hover:bg-accent',
  }
  return (
    <button
      onClick={() => onChange(value)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
        colorMap[color],
      )}
    >
      {label}
      <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold', active ? 'bg-white/25' : 'bg-muted text-muted-foreground')}>
        {count}
      </span>
    </button>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isSelected,
  onToggle,
}: {
  project: PreviewProject & { name: string }
  isSelected: boolean
  onToggle: () => void
}) {
  const gradient = getGradient(project.key)
  return (
    <div
      onClick={onToggle}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => e.key === ' ' && onToggle()}
      className={cn(
        'flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-150 group border',
        isSelected
          ? 'bg-primary/10 border-primary/30 shadow-sm'
          : 'bg-card/60 border-border hover:border-primary/20 hover:bg-primary/5 dark:hover:bg-primary/5',
      )}
    >
      {/* Gradient key badge */}
      <div className={cn(
        'h-11 w-11 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-sm',
        gradient,
      )}>
        <span className="text-white text-sm font-bold tracking-tight">
          {project.key.slice(0, 2)}
        </span>
      </div>

      {/* Name + key */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {project.name}
        </p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          {project.key}
        </p>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="font-medium text-muted-foreground">{project.issueCount.toLocaleString()}</span>
          <span>issues</span>
        </span>
        {project.sprintCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="font-medium text-muted-foreground">{project.sprintCount}</span>
            <span>sprints</span>
          </span>
        )}
      </div>

      {/* Checkbox */}
      <div className="flex-shrink-0 ml-2">
        {isSelected ? (
          <CheckSquare className="h-5 w-5 text-primary" />
        ) : (
          <Square className="h-5 w-5 text-muted-foreground/60 group-hover:text-muted-foreground" />
        )}
      </div>
    </div>
  )
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({
  member,
  isSelected,
  onToggle,
}: {
  member: JiraMember
  isSelected: boolean
  onToggle: () => void
}) {
  const gradient = getGradient(member.displayName, MEMBER_GRADIENTS)
  return (
    <div
      onClick={onToggle}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => e.key === ' ' && onToggle()}
      className={cn(
        'flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-150 group border',
        isSelected
          ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 shadow-sm'
          : 'bg-card/60 border-border hover:border-violet-100 hover:bg-violet-50/40 dark:hover:bg-violet-950/10',
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt={member.displayName}
            className="h-9 w-9 rounded-full object-cover ring-2 ring-card"
            onError={(e) => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              const next = el.nextElementSibling as HTMLElement | null
              if (next) next.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className={cn(
            'h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ring-2 ring-card',
            gradient,
            member.avatarUrl ? 'hidden' : 'flex',
          )}
        >
          {getInitials(member.displayName)}
        </div>
      </div>

      {/* Name + email */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {member.displayName}
        </p>
        {member.email && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
            <Mail className="h-3 w-3 flex-shrink-0" />
            {member.email}
          </p>
        )}
      </div>

      {/* Check */}
      <div className="flex-shrink-0">
        {isSelected ? (
          <CheckSquare className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground/60 group-hover:text-muted-foreground" />
        )}
      </div>
    </div>
  )
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function ProjectSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-muted animate-pulse border border-border">
          <div className="h-11 w-11 rounded-xl bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-muted rounded-md w-36" />
            <div className="h-3 bg-muted rounded-md w-16" />
          </div>
          <div className="flex gap-4">
            <div className="h-3 bg-muted rounded w-20" />
            <div className="h-3 bg-muted rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

function MemberSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-muted animate-pulse border border-border">
          <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-muted rounded-md w-28" />
            <div className="h-2.5 bg-muted rounded-md w-36" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
  const [projectFilter, setProjectFilter] = useState<SelectionFilter>('all')
  const [memberFilter, setMemberFilter] = useState<SelectionFilter>('all')

  const previewMutation = usePreviewMigration()
  const membersQuery = useMigrationMembers(connectionId ?? null)
  const projectsQuery = useMigrationProjects(
    connectResult.projects.length === 0 && connectionId ? connectionId : null,
  )

  const availableProjects =
    connectResult.projects.length > 0 ? connectResult.projects : (projectsQuery.data ?? [])

  useEffect(() => {
    const allKeys = availableProjects.map((p) => p.key)
    if (allKeys.length > 0) {
      previewMutation.mutate({ runId, projectKeys: allKeys })
    }
  }, [runId, availableProjects.length]) // eslint-disable-line

  useEffect(() => {
    if (previewMutation.data?.projects && previewMutation.data.projects.length > 0) {
      const allKeys = previewMutation.data.projects.map((p: PreviewProject) => p.key)
      setSelectedKeys(new Set(allKeys))
    }
  }, [previewMutation.data?.projects?.length]) // eslint-disable-line

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

  // Derived counts for filter pills
  const projectCounts = useMemo(() => ({
    all: enrichedProjects.length,
    selected: enrichedProjects.filter((p) => selectedKeys.has(p.key)).length,
    unselected: enrichedProjects.filter((p) => !selectedKeys.has(p.key)).length,
  }), [enrichedProjects, selectedKeys])

  const memberCounts = useMemo(() => ({
    all: members.length,
    selected: members.filter((m) => selectedMemberIds.has(m.accountId)).length,
    unselected: members.filter((m) => !selectedMemberIds.has(m.accountId)).length,
  }), [members, selectedMemberIds])

  // Filtered project list
  const filteredProjects = useMemo(() => {
    let list = enrichedProjects
    const q = projectSearch.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
    if (projectFilter === 'selected') list = list.filter((p) => selectedKeys.has(p.key))
    if (projectFilter === 'unselected') list = list.filter((p) => !selectedKeys.has(p.key))
    return list
  }, [enrichedProjects, projectSearch, projectFilter, selectedKeys])

  // Filtered member list
  const filteredMembers = useMemo(() => {
    let list = members
    const q = memberSearch.trim().toLowerCase()
    if (q) list = list.filter((m) => m.displayName.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q))
    if (memberFilter === 'selected') list = list.filter((m) => selectedMemberIds.has(m.accountId))
    if (memberFilter === 'unselected') list = list.filter((m) => !selectedMemberIds.has(m.accountId))
    return list
  }, [members, memberSearch, memberFilter, selectedMemberIds])

  const selectedProjects = enrichedProjects.filter((p) => selectedKeys.has(p.key))
  const totalIssues = selectedProjects.reduce((s, p) => s + p.issueCount, 0)
  const estimatedMinutes = Math.max(1, Math.ceil(totalIssues / 100))

  const allProjectsSelected = enrichedProjects.length > 0 && selectedKeys.size === enrichedProjects.length
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
    const memberIds = allMembersSelected ? undefined : Array.from(selectedMemberIds)
    onNext(
      Array.from(selectedKeys),
      enrichedProjects.filter((p) => selectedKeys.has(p.key)),
      memberIds,
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">
          What would you like to import?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the projects and team members to migrate into Boardupscale.
        </p>
      </div>

      {/* Two-column panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Projects Panel ─────────────────────────────────────────── */}
        <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-blue-50/80 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/10">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/20 dark:shadow-primary/40">
                <FolderOpen className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-bold text-foreground">Projects</span>
                {!isLoading && enrichedProjects.length > 0 && (
                  <span className="ml-2 text-xs bg-primary/10 dark:bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">
                    {selectedKeys.size} / {enrichedProjects.length} selected
                  </span>
                )}
              </div>
            </div>
            {!isLoading && enrichedProjects.length > 0 && (
              <button
                onClick={() =>
                  allProjectsSelected
                    ? setSelectedKeys(new Set())
                    : setSelectedKeys(new Set(enrichedProjects.map((p) => p.key)))
                }
                className="text-xs text-primary hover:text-primary/80 dark:hover:text-primary font-semibold transition-colors"
              >
                {allProjectsSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {/* Search + filters */}
          <div className="px-4 pt-3.5 pb-2 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search projects by name or key..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="pl-9 pr-8 py-2.5 text-sm bg-muted rounded-xl"
              />
              {projectSearch && (
                <button
                  onClick={() => setProjectSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Filter pills */}
            {!isLoading && enrichedProjects.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <FilterPill value="all" current={projectFilter} label="All" count={projectCounts.all} color="blue" onChange={setProjectFilter} />
                <FilterPill value="selected" current={projectFilter} label="Selected" count={projectCounts.selected} color="blue" onChange={setProjectFilter} />
                <FilterPill value="unselected" current={projectFilter} label="Unselected" count={projectCounts.unselected} color="blue" onChange={setProjectFilter} />
              </div>
            )}
          </div>

          {/* Project list */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2" style={{ maxHeight: '420px', minHeight: '200px' }}>
            {isLoading && <ProjectSkeleton />}

            {!isLoading && filteredProjects.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  {projectSearch || projectFilter !== 'all'
                    ? 'No projects match your filters.'
                    : 'No projects found in this Jira instance.'}
                </p>
                {(projectSearch || projectFilter !== 'all') && (
                  <button
                    onClick={() => { setProjectSearch(''); setProjectFilter('all') }}
                    className="mt-2 text-xs text-primary hover:underline font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {!isLoading && filteredProjects.map((project) => (
              <ProjectCard
                key={project.key}
                project={project}
                isSelected={selectedKeys.has(project.key)}
                onToggle={() => toggleProject(project.key)}
              />
            ))}
          </div>
        </div>

        {/* ── Members Panel ──────────────────────────────────────────── */}
        {connectionId ? (
          <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-violet-50/80 to-purple-50/50 dark:from-violet-950/20 dark:to-purple-950/10">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-sm shadow-violet-200 dark:shadow-violet-900/40">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <div>
                  <span className="text-sm font-bold text-foreground">Team Members</span>
                  {!membersQuery.isLoading && members.length > 0 && (
                    <span className="ml-2 text-xs bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-semibold">
                      {selectedMemberIds.size} / {members.length} selected
                    </span>
                  )}
                </div>
              </div>
              {!membersQuery.isLoading && members.length > 0 && (
                <button
                  onClick={() =>
                    allMembersSelected
                      ? setSelectedMemberIds(new Set())
                      : setSelectedMemberIds(new Set(members.map((m) => m.accountId)))
                  }
                  className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 font-semibold transition-colors"
                >
                  {allMembersSelected ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {/* Search + filters */}
            <div className="px-4 pt-3.5 pb-2 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by name or email..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9 pr-8 py-2.5 text-sm bg-muted rounded-xl"
                />
                {memberSearch && (
                  <button
                    onClick={() => setMemberSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Filter pills */}
              {!membersQuery.isLoading && members.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <FilterPill value="all" current={memberFilter} label="All" count={memberCounts.all} color="violet" onChange={setMemberFilter} />
                  <FilterPill value="selected" current={memberFilter} label="Selected" count={memberCounts.selected} color="violet" onChange={setMemberFilter} />
                  <FilterPill value="unselected" current={memberFilter} label="Unselected" count={memberCounts.unselected} color="violet" onChange={setMemberFilter} />
                </div>
              )}
            </div>

            {/* Member list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2" style={{ maxHeight: '420px', minHeight: '200px' }}>
              {membersQuery.isLoading && <MemberSkeleton />}

              {!membersQuery.isLoading && filteredMembers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {memberSearch || memberFilter !== 'all'
                      ? 'No members match your filters.'
                      : 'No members found in this Jira instance.'}
                  </p>
                  {(memberSearch || memberFilter !== 'all') && (
                    <button
                      onClick={() => { setMemberSearch(''); setMemberFilter('all') }}
                      className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {!membersQuery.isLoading && filteredMembers.map((member) => (
                <MemberCard
                  key={member.accountId}
                  member={member}
                  isSelected={selectedMemberIds.has(member.accountId)}
                  onToggle={() => toggleMember(member.accountId)}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Placeholder when no connectionId */
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/50 p-12 text-center">
            <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              Team members will appear here
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Connect via OAuth to automatically import and sync your Jira team members.
            </p>
          </div>
        )}
      </div>

      {/* ── Summary Bar ────────────────────────────────────────────────── */}
      {selectedKeys.size > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-5 text-white shadow-lg shadow-blue-500/25 dark:shadow-primary/40">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">Projects</p>
              <p className="text-white text-2xl font-bold">{selectedKeys.size}</p>
              <p className="text-blue-200 text-xs mt-0.5">of {enrichedProjects.length}</p>
            </div>
            <div className="text-center">
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">Issues</p>
              <p className="text-white text-2xl font-bold">{totalIssues.toLocaleString()}</p>
              <p className="text-blue-200 text-xs mt-0.5">total to migrate</p>
            </div>
            <div className="text-center">
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">Members</p>
              <p className="text-white text-2xl font-bold">{selectedMemberIds.size}</p>
              <p className="text-blue-200 text-xs mt-0.5">of {members.length}</p>
            </div>
            <div className="text-center">
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">Est. Time</p>
              <p className="text-white text-2xl font-bold flex items-center justify-center gap-1.5">
                <Zap className="h-5 w-5 text-yellow-300" />
                ~{estimatedMinutes}m
              </p>
              <p className="text-blue-200 text-xs mt-0.5">approximate</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" onClick={onBack} className="gap-2">
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={selectedKeys.size === 0 || isLoading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 gap-2 shadow-sm shadow-primary/20 dark:shadow-primary/40"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading projects...
            </>
          ) : (
            `Continue with ${selectedKeys.size} project${selectedKeys.size !== 1 ? 's' : ''}`
          )}
        </Button>
      </div>
    </div>
  )
}
