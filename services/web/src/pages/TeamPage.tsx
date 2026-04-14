import { useState, useMemo } from 'react'
import {
  Users,
  UserPlus,
  MoreHorizontal,
  Mail,
  ShieldCheck,
  UserX,
  RefreshCw,
  Trash2,
  Search,
  Crown,
  Shield,
  User2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Pencil,
  AtSign,
} from 'lucide-react'
import { useMe } from '@/hooks/useAuth'
import {
  useOrgMembers,
  useInviteMember,
  useUpdateMember,
  useUpdateMemberEmail,
  useUpdateMemberRole,
  useDeactivateMember,
  useResendInvitation,
  useRevokeInvitation,
} from '@/hooks/useOrganization'
import { User, UserRole } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

// ─── Role Config ─────────────────────────────────────────────────────────────
const ROLE_CONFIG = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Full control over the organization, billing, and all settings',
    icon: Crown,
    iconColor: 'text-purple-500',
    selectedBg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-400 dark:border-purple-600',
    defaultBg: 'bg-card/50 border-border',
    badgeCls:
      'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Manage members, projects, and organization settings',
    icon: Shield,
    iconColor: 'text-primary',
    selectedBg: 'bg-primary/10 border-primary dark:border-primary',
    defaultBg: 'bg-card/50 border-border',
    badgeCls:
      'bg-primary/15 text-primary border border-primary/30 dark:border-primary/40',
  },
  {
    value: 'member',
    label: 'Member',
    description: 'Access and collaborate on assigned projects',
    icon: User2,
    iconColor: 'text-muted-foreground',
    selectedBg: 'bg-muted border-muted-foreground',
    defaultBg: 'bg-card/50 border-border',
    badgeCls:
      'bg-muted text-foreground border border-border',
  },
] as const

type RoleValue = 'owner' | 'admin' | 'member'

function getRoleConfig(role: string) {
  return ROLE_CONFIG.find((r) => r.value === role) ?? ROLE_CONFIG[2]
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-emerald-500 to-emerald-600',
  'from-orange-500 to-orange-600',
  'from-pink-500 to-pink-600',
  'from-cyan-500 to-cyan-600',
  'from-indigo-500 to-indigo-600',
  'from-rose-500 to-rose-600',
]

function getAvatarGradient(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

function isMigratedEmail(email: string) {
  return email.endsWith('@migrated.jira.local')
}

function avatarInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function MemberAvatar({ member, size = 9 }: { member: User; size?: number }) {
  const sizeClass = size === 10 ? 'h-10 w-10' : 'h-9 w-9'
  return (
    <div
      className={cn(
        sizeClass,
        'rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 bg-gradient-to-br shadow-sm',
        getAvatarGradient(member.id),
      )}
    >
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className={cn(sizeClass, 'rounded-full object-cover')} />
      ) : (
        avatarInitials(member.displayName)
      )}
    </div>
  )
}

// ─── Role Card ────────────────────────────────────────────────────────────────
function RoleCard({
  config,
  selected,
  onClick,
}: {
  config: (typeof ROLE_CONFIG)[number]
  selected: boolean
  onClick: () => void
}) {
  const Icon = config.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150',
        selected ? config.selectedBg : config.defaultBg,
        'hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:ring-offset-2 focus:ring-offset-background',
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center',
          selected ? 'bg-card/60' : 'bg-muted',
        )}
      >
        <Icon className={cn('h-4 w-4', config.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {config.label}
          </span>
          {selected && <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {config.description}
        </p>
      </div>
    </button>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // Show at most 7 page numbers with ellipsis
  const pages: (number | '…')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++)
      pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-between px-1 mt-4">
      <p className="text-xs text-muted-foreground">
        Showing{' '}
        <span className="font-medium text-foreground">
          {from}–{to}
        </span>{' '}
        of{' '}
        <span className="font-medium text-foreground">{total}</span> members
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="w-8 text-center text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={cn(
                'h-8 w-8 rounded-md text-sm font-medium transition-colors',
                p === page
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {p}
            </button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function TeamPage() {
  const { data: me } = useMe()
  const { data: members = [], isLoading } = useOrgMembers()
  const inviteMember = useInviteMember()
  const updateMember = useUpdateMember()
  const updateMemberEmail = useUpdateMemberEmail()
  const updateRole = useUpdateMemberRole()
  const deactivateMember = useDeactivateMember()
  const resendInvitation = useResendInvitation()
  const revokeInvitation = useRevokeInvitation()

  // ── Invite dialog ─────────────────────────────────────────────────────────
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteRole, setInviteRole] = useState<RoleValue>('member')

  // ── Edit member dialog ────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState('')

  // ── Change role dialog ────────────────────────────────────────────────────
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [roleTarget, setRoleTarget] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<RoleValue>('member')

  // ── Update email dialog ───────────────────────────────────────────────────
  const [emailTarget, setEmailTarget] = useState<User | null>(null)
  const [newEmail, setNewEmail] = useState('')

  // ── Confirmations ─────────────────────────────────────────────────────────
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<User | null>(null)

  // ── Search & filter ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  // ── Pagination ────────────────────────────────────────────────────────────
  const [activePage, setActivePage] = useState(1)

  const isAdmin = me?.role === UserRole.OWNER || me?.role === UserRole.ADMIN

  const activeMembers = useMemo(() => members.filter((m) => m.isActive), [members])
  const pendingMembers = useMemo(() => members.filter((m) => !m.isActive), [members])

  const filteredActive = useMemo(() => {
    let list = activeMembers
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) => m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      )
    }
    if (roleFilter !== 'all') {
      list = list.filter((m) => (m.role as string) === roleFilter)
    }
    return list
  }, [activeMembers, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filteredActive.length / PAGE_SIZE))
  const pagedMembers = useMemo(
    () => filteredActive.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE),
    [filteredActive, activePage],
  )

  const adminCount = activeMembers.filter(
    (m) => m.role === UserRole.ADMIN || m.role === UserRole.OWNER,
  ).length

  const handleSearch = (v: string) => { setSearch(v); setActivePage(1) }
  const handleRoleFilter = (v: string) => { setRoleFilter(v); setActivePage(1) }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleInvite = () => {
    if (!inviteEmail.trim()) return
    inviteMember.mutate(
      { email: inviteEmail.trim(), displayName: inviteDisplayName.trim() || undefined, role: inviteRole },
      {
        onSuccess: () => {
          setShowInviteDialog(false)
          setInviteEmail('')
          setInviteDisplayName('')
          setInviteRole('member')
        },
      },
    )
  }

  const openEditDialog = (member: User) => {
    setEditTarget(member)
    setEditName(member.displayName)
    setEditAvatar(member.avatarUrl ?? '')
  }

  const handleEditSave = () => {
    if (!editTarget || !editName.trim()) return
    updateMember.mutate(
      { memberId: editTarget.id, displayName: editName.trim(), avatarUrl: editAvatar.trim() || undefined },
      { onSuccess: () => setEditTarget(null) },
    )
  }

  const openRoleDialog = (member: User) => {
    setRoleTarget(member)
    setNewRole((member.role as RoleValue) ?? 'member')
    setShowRoleDialog(true)
  }

  const handleRoleChange = () => {
    if (!roleTarget) return
    updateRole.mutate(
      { memberId: roleTarget.id, role: newRole },
      { onSuccess: () => setShowRoleDialog(false) },
    )
  }

  const openEmailDialog = (member: User) => {
    setEmailTarget(member)
    setNewEmail('')
  }

  const handleEmailSave = () => {
    if (!emailTarget || !newEmail.trim()) return
    updateMemberEmail.mutate(
      { memberId: emailTarget.id, email: newEmail.trim() },
      { onSuccess: () => { setEmailTarget(null); setNewEmail('') } },
    )
  }

  if (isLoading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Team"
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Team' },
        ]}
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="h-4 w-4" />
              Invite Member
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              icon: Users,
              iconBg: 'bg-primary/10',
              iconColor: 'text-primary',
              label: 'Total Members',
              value: activeMembers.length,
            },
            {
              icon: Shield,
              iconBg: 'bg-purple-50 dark:bg-purple-900/20',
              iconColor: 'text-purple-600 dark:text-purple-400',
              label: 'Admins & Owners',
              value: adminCount,
            },
            {
              icon: Clock,
              iconBg: 'bg-amber-50 dark:bg-amber-900/20',
              iconColor: 'text-amber-600 dark:text-amber-400',
              label: 'Pending Invites',
              value: pendingMembers.length,
            },
          ].map(({ icon: Icon, iconBg, iconColor, label, value }) => (
            <div
              key={label}
              className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-4"
            >
              <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
                <Icon className={cn('h-5 w-5', iconColor)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Active Members ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Active Members
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeMembers.length} people with access to this organization
              </p>
            </div>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowInviteDialog(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Add Member
              </Button>
            )}
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9 pr-3"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              {['all', 'owner', 'admin', 'member'].map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleFilter(r)}
                  className={cn(
                    'px-3 h-7 rounded-md text-xs font-medium transition-all',
                    roleFilter === r
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredActive.length === 0 ? (
            <div className="bg-card rounded-xl border border-border/60 py-16">
              <EmptyState
                icon={<Users className="h-10 w-10" />}
                title={search || roleFilter !== 'all' ? 'No results found' : 'No active members'}
                description={
                  search || roleFilter !== 'all'
                    ? 'Try adjusting your search or filter.'
                    : 'Invite team members to get started.'
                }
              />
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 border-b border-border bg-muted/60">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Member
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Role
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </span>
                {isAdmin && (
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions
                  </span>
                )}
              </div>

              {pagedMembers.map((member, idx) => {
                const roleConf = getRoleConfig(member.role as string)
                const RoleIcon = roleConf.icon
                const isMe = member.id === me?.id

                return (
                  <div
                    key={member.id}
                    className={cn(
                      'grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/50 group',
                      idx < pagedMembers.length - 1
                        ? 'border-b border-border'
                        : '',
                    )}
                  >
                    {/* Member info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <MemberAvatar member={member} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">
                            {member.displayName}
                          </span>
                          {isMe && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
                              You
                            </span>
                          )}
                        </div>
                        {isMigratedEmail(member.email) ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                            <AtSign className="h-3 w-3" />
                            Migrated (no email)
                          </span>
                        ) : (
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Role */}
                    <div className="flex items-center gap-1.5">
                      <RoleIcon className={cn('h-3.5 w-3.5 flex-shrink-0', roleConf.iconColor)} />
                      <span className={cn('text-xs font-medium px-2 py-1 rounded-full', roleConf.badgeCls)}>
                        {roleConf.label}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">Active</span>
                    </div>

                    {/* Actions — always visible, not hidden behind ... */}
                    {isAdmin ? (
                      <div className="flex items-center gap-1">
                        {!isMe ? (
                          <>
                            {isMigratedEmail(member.email) && (
                              <button
                                onClick={() => openEmailDialog(member)}
                                title="Add real email"
                                className="h-8 w-8 flex items-center justify-center rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                              >
                                <AtSign className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => openEditDialog(member)}
                              title="Edit member info"
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/10 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openRoleDialog(member)}
                              title="Change role"
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeactivateTarget(member)}
                              title="Remove member"
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <UserX className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground px-2">—</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          <Pagination
            page={activePage}
            totalPages={totalPages}
            total={filteredActive.length}
            pageSize={PAGE_SIZE}
            onPage={setActivePage}
          />
        </section>

        {/* ── Pending Invitations ────────────────────────────────────────── */}
        {pendingMembers.length > 0 && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">
                Pending Invitations
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pendingMembers.length} invitation{pendingMembers.length !== 1 ? 's' : ''} awaiting
                acceptance
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 border-b border-border bg-amber-50/60 dark:bg-amber-900/10">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Invited Email
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Role
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </span>
                {isAdmin && (
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions
                  </span>
                )}
              </div>

              {pendingMembers.map((member, idx) => {
                const roleConf = getRoleConfig(member.role as string)
                const RoleIcon = roleConf.icon
                return (
                  <div
                    key={member.id}
                    className={cn(
                      'grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-amber-50/40 dark:hover:bg-amber-900/5',
                      idx < pendingMembers.length - 1
                        ? 'border-b border-border'
                        : '',
                    )}
                  >
                    {/* Email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {member.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.displayName !== member.email ? member.displayName : 'No display name set'}
                        </p>
                      </div>
                    </div>

                    {/* Role */}
                    <div className="flex items-center gap-1.5">
                      <RoleIcon className={cn('h-3.5 w-3.5 flex-shrink-0', roleConf.iconColor)} />
                      <span className={cn('text-xs font-medium px-2 py-1 rounded-full', roleConf.badgeCls)}>
                        {roleConf.label}
                      </span>
                    </div>

                    {/* Pending badge */}
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 flex-shrink-0 whitespace-nowrap">
                      Pending
                    </span>

                    {/* Actions — explicit buttons */}
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => resendInvitation.mutate(member.id)}
                          title="Resend invitation"
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/10 transition-colors"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setRevokeTarget(member)}
                          title="Revoke invitation"
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Empty invite CTA ───────────────────────────────────────────── */}
        {pendingMembers.length === 0 && activeMembers.length === 0 && isAdmin && (
          <div className="bg-primary/5 rounded-xl border border-primary/20 p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Build your team
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Invite your colleagues to collaborate on projects
            </p>
            <Button size="sm" onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="h-4 w-4" />
              Invite your first member
            </Button>
          </div>
        )}
      </div>

      {/* ────────────────────────── Dialogs ─────────────────────────────────── */}

      {/* Invite Member */}
      <Dialog open={showInviteDialog} onOpenChange={(o) => !o && setShowInviteDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle>Invite Team Member</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  They'll receive an email with a link to join
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Email address"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
              <Input
                label="Display name (optional)"
                placeholder="Jane Doe"
                value={inviteDisplayName}
                onChange={(e) => setInviteDisplayName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Role
              </label>
              <div className="space-y-2">
                {ROLE_CONFIG.map((conf) => (
                  <RoleCard
                    key={conf.value}
                    config={conf}
                    selected={inviteRole === conf.value}
                    onClick={() => setInviteRole(conf.value as RoleValue)}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail.trim()}
              isLoading={inviteMember.isPending}
            >
              <Mail className="h-4 w-4" />
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Info */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-muted border border-border flex items-center justify-center flex-shrink-0">
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle>Edit Member</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Update this member's display info
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {editTarget && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/60 border border-border">
                <MemberAvatar member={editTarget} size={10} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {editTarget.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">{editTarget.email}</p>
                </div>
              </div>
            )}
            <Input
              label="Display name"
              placeholder="Jane Doe"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Input
              label="Avatar URL (optional)"
              placeholder="https://example.com/avatar.png"
              value={editAvatar}
              onChange={(e) => setEditAvatar(e.target.value)}
            />
            {editAvatar && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <img
                  src={editAvatar}
                  alt="Preview"
                  className="h-8 w-8 rounded-full object-cover border border-border"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                Avatar preview
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={!editName.trim()}
              isLoading={updateMember.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role */}
      <Dialog open={showRoleDialog} onOpenChange={(o) => !o && setShowRoleDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <DialogTitle>Change Role</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            {roleTarget && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/60 border border-border">
                <MemberAvatar member={roleTarget} size={10} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {roleTarget.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">{roleTarget.email}</p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                New role
              </label>
              <div className="space-y-2">
                {ROLE_CONFIG.map((conf) => (
                  <RoleCard
                    key={conf.value}
                    config={conf}
                    selected={newRole === conf.value}
                    onClick={() => setNewRole(conf.value as RoleValue)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange} isLoading={updateRole.isPending}>
              <ShieldCheck className="h-4 w-4" />
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Email for Migrated Member */}
      <Dialog open={!!emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <AtSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <DialogTitle>Add Email Address</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set the real email for this Jira-migrated member. An invitation will be sent.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {emailTarget && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/60 border border-border">
                <MemberAvatar member={emailTarget} size={10} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {emailTarget.displayName}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                    <AtSign className="h-3 w-3" />
                    Migrated (no email)
                  </span>
                </div>
              </div>
            )}
            <Input
              label="Real email address"
              type="email"
              placeholder="colleague@company.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmailSave()}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleEmailSave}
              disabled={!newEmail.trim()}
              isLoading={updateMemberEmail.isPending}
            >
              <AtSign className="h-4 w-4" />
              Save Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate / Remove */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (!deactivateTarget) return
          deactivateMember.mutate(deactivateTarget.id, {
            onSuccess: () => setDeactivateTarget(null),
          })
        }}
        title="Remove Member"
        description={`Remove ${deactivateTarget?.displayName} from the organization? They will immediately lose access to all projects.`}
        confirmLabel="Remove"
        destructive
        isLoading={deactivateMember.isPending}
      />

      {/* Revoke invitation */}
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (!revokeTarget) return
          revokeInvitation.mutate(revokeTarget.id, {
            onSuccess: () => setRevokeTarget(null),
          })
        }}
        title="Revoke Invitation"
        description={`Revoke the pending invitation for ${revokeTarget?.email}? The invite link will stop working immediately.`}
        confirmLabel="Revoke"
        destructive
        isLoading={revokeInvitation.isPending}
      />
    </div>
  )
}
