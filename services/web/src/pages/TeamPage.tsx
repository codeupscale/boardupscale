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
} from 'lucide-react'
import { useMe } from '@/hooks/useAuth'
import {
  useOrgMembers,
  useInviteMember,
  useUpdateMemberRole,
  useDeactivateMember,
  useResendInvitation,
  useRevokeInvitation,
} from '@/hooks/useOrganization'
import { User, UserRole } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { DropdownMenu, DropdownItem } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

const ROLE_CONFIG = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Full control over the organization, billing, and all settings',
    icon: Crown,
    iconColor: 'text-purple-500',
    selectedBg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-400 dark:border-purple-600',
    defaultBg: 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
    badgeCls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Manage members, projects, and organization settings',
    icon: Shield,
    iconColor: 'text-blue-500',
    selectedBg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600',
    defaultBg: 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
    badgeCls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700',
  },
  {
    value: 'member',
    label: 'Member',
    description: 'Access and collaborate on assigned projects',
    icon: User2,
    iconColor: 'text-gray-500 dark:text-gray-400',
    selectedBg: 'bg-gray-50 dark:bg-gray-700/50 border-gray-400 dark:border-gray-500',
    defaultBg: 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
    badgeCls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600',
  },
] as const

type RoleValue = 'owner' | 'admin' | 'member'

function getRoleConfig(role: string) {
  return ROLE_CONFIG.find((r) => r.value === role) ?? ROLE_CONFIG[2]
}

const AVATAR_COLORS = [
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
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function avatarInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Role Card (reused in invite + change-role dialogs) ───────────────────────
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
        'hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center',
          selected ? 'bg-white dark:bg-gray-900/60' : 'bg-gray-50 dark:bg-gray-700',
        )}
      >
        <Icon className={cn('h-4 w-4', config.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {config.label}
          </span>
          {selected && (
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
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

  return (
    <div className="flex items-center justify-between px-1 mt-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Showing <span className="font-medium text-gray-700 dark:text-gray-300">{from}–{to}</span> of{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">{total}</span> members
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
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={cn(
              'h-8 w-8 rounded-md text-sm font-medium transition-colors',
              p === page
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
          >
            {p}
          </button>
        ))}
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
  const updateRole = useUpdateMemberRole()
  const deactivateMember = useDeactivateMember()
  const resendInvitation = useResendInvitation()
  const revokeInvitation = useRevokeInvitation()

  // Invite dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteRole, setInviteRole] = useState<RoleValue>('member')

  // Change role dialog
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [roleTarget, setRoleTarget] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<RoleValue>('member')

  // Confirmations
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<User | null>(null)

  // Search & filter
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  // Pagination
  const [activePage, setActivePage] = useState(1)

  const isAdmin = me?.role === UserRole.ADMIN

  const activeMembers = useMemo(() => members.filter((m) => m.isActive), [members])
  const pendingMembers = useMemo(() => members.filter((m) => !m.isActive), [members])

  const filteredActive = useMemo(() => {
    let list = activeMembers
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          m.displayName.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      )
    }
    if (roleFilter !== 'all') {
      list = list.filter((m) => m.role === roleFilter)
    }
    return list
  }, [activeMembers, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filteredActive.length / PAGE_SIZE))
  const pagedMembers = useMemo(
    () => filteredActive.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE),
    [filteredActive, activePage],
  )

  // reset page when filter changes
  const handleSearch = (v: string) => {
    setSearch(v)
    setActivePage(1)
  }
  const handleRoleFilter = (v: string) => {
    setRoleFilter(v)
    setActivePage(1)
  }

  const adminCount = activeMembers.filter((m) => m.role === UserRole.ADMIN).length

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

  const handleRoleChange = () => {
    if (!roleTarget) return
    updateRole.mutate(
      { memberId: roleTarget.id, role: newRole },
      { onSuccess: () => setShowRoleDialog(false) },
    )
  }

  const openRoleDialog = (member: User) => {
    setRoleTarget(member)
    setNewRole(member.role as RoleValue)
    setShowRoleDialog(true)
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

        {/* ── Stats Row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              icon: Users,
              iconBg: 'bg-blue-50 dark:bg-blue-900/20',
              iconColor: 'text-blue-600 dark:text-blue-400',
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
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/60 p-4 flex items-center gap-4"
            >
              <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
                <Icon className={cn('h-5 w-5', iconColor)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Active Members ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Active Members
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {activeMembers.length} people with access to this organization
              </p>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search members…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {['all', 'owner', 'admin', 'member'].map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleFilter(r)}
                  className={cn(
                    'px-3 h-7 rounded-md text-xs font-medium transition-all',
                    roleFilter === r
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                  )}
                >
                  {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredActive.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/60 py-12">
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
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[2fr_1fr_auto_auto] items-center gap-4 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Member</span>
                <span className="hidden sm:block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Role</span>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</span>
                <span className="w-8" />
              </div>

              {pagedMembers.map((member, idx) => {
                const roleConf = getRoleConfig(member.role)
                const RoleIcon = roleConf.icon
                const isMe = member.id === me?.id

                return (
                  <div
                    key={member.id}
                    className={cn(
                      'grid grid-cols-[1fr_auto_auto] sm:grid-cols-[2fr_1fr_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors',
                      'hover:bg-gray-50/70 dark:hover:bg-gray-800/40',
                      idx < pagedMembers.length - 1
                        ? 'border-b border-gray-100 dark:border-gray-800'
                        : '',
                    )}
                  >
                    {/* Member info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 bg-gradient-to-br shadow-sm',
                          getAvatarGradient(member.id),
                        )}
                      >
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          avatarInitials(member.displayName)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {member.displayName}
                          </span>
                          {isMe && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex-shrink-0">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                      </div>
                    </div>

                    {/* Role */}
                    <div className="hidden sm:flex items-center gap-1.5">
                      <RoleIcon className={cn('h-3.5 w-3.5', roleConf.iconColor)} />
                      <span className={cn('text-xs font-medium px-2 py-1 rounded-full', roleConf.badgeCls)}>
                        {roleConf.label}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">Active</span>
                    </div>

                    {/* Actions */}
                    <div className="w-8 flex justify-end">
                      {isAdmin && !isMe ? (
                        <DropdownMenu
                          trigger={
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        >
                          <DropdownItem
                            onClick={() => openRoleDialog(member)}
                            icon={<ShieldCheck className="h-4 w-4" />}
                          >
                            Change Role
                          </DropdownItem>
                          <DropdownItem
                            destructive
                            onClick={() => setDeactivateTarget(member)}
                            icon={<UserX className="h-4 w-4" />}
                          >
                            Deactivate
                          </DropdownItem>
                        </DropdownMenu>
                      ) : (
                        <div className="w-8" />
                      )}
                    </div>
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
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Pending Invitations
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {pendingMembers.length} invitation{pendingMembers.length !== 1 ? 's' : ''} awaiting acceptance
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
              {pendingMembers.map((member, idx) => {
                const roleConf = getRoleConfig(member.role)
                const RoleIcon = roleConf.icon
                return (
                  <div
                    key={member.id}
                    className={cn(
                      'flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-amber-50/50 dark:hover:bg-amber-900/5',
                      idx < pendingMembers.length - 1
                        ? 'border-b border-gray-100 dark:border-gray-800'
                        : '',
                    )}
                  >
                    <div className="h-9 w-9 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {member.email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <RoleIcon className={cn('h-3 w-3', roleConf.iconColor)} />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Invited as {roleConf.label}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex-shrink-0">
                      Pending
                    </span>
                    {isAdmin && (
                      <DropdownMenu
                        trigger={
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      >
                        <DropdownItem
                          onClick={() => resendInvitation.mutate(member.id)}
                          icon={<RefreshCw className="h-4 w-4" />}
                        >
                          Resend Invitation
                        </DropdownItem>
                        <DropdownItem
                          destructive
                          onClick={() => setRevokeTarget(member)}
                          icon={<Trash2 className="h-4 w-4" />}
                        >
                          Revoke Invitation
                        </DropdownItem>
                      </DropdownMenu>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── Invite Member Dialog ──────────────────────────────────────────── */}
      <Dialog open={showInviteDialog} onClose={() => setShowInviteDialog(false)}>
        <DialogHeader onClose={() => setShowInviteDialog(false)}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle>Invite Team Member</DialogTitle>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                They'll receive an email to join your organization
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent className="space-y-5">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
        </DialogContent>

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
      </Dialog>

      {/* ── Change Role Dialog ────────────────────────────────────────────── */}
      <Dialog open={showRoleDialog} onClose={() => setShowRoleDialog(false)}>
        <DialogHeader onClose={() => setShowRoleDialog(false)}>
          <DialogTitle>Change Role</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          {roleTarget && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
              <div
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white bg-gradient-to-br shadow-sm flex-shrink-0',
                  getAvatarGradient(roleTarget.id),
                )}
              >
                {roleTarget.avatarUrl ? (
                  <img src={roleTarget.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  avatarInitials(roleTarget.displayName)
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{roleTarget.displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{roleTarget.email}</p>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleRoleChange} isLoading={updateRole.isPending}>
            <ShieldCheck className="h-4 w-4" />
            Update Role
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Deactivate Confirmation ───────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (!deactivateTarget) return
          deactivateMember.mutate(deactivateTarget.id, {
            onSuccess: () => setDeactivateTarget(null),
          })
        }}
        title="Deactivate Member"
        description={`Are you sure you want to deactivate ${deactivateTarget?.displayName}? They will lose access to the organization immediately.`}
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivateMember.isPending}
      />

      {/* ── Revoke Confirmation ───────────────────────────────────────────── */}
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
        description={`Revoke the pending invitation for ${revokeTarget?.email}? They won't be able to join using the invite link.`}
        confirmLabel="Revoke"
        destructive
        isLoading={revokeInvitation.isPending}
      />
    </div>
  )
}
