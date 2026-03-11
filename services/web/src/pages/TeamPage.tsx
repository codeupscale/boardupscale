import { useState, useMemo } from 'react'
import { Users, UserPlus, MoreHorizontal, Mail, ShieldCheck, UserX, RefreshCw, Trash2 } from 'lucide-react'
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

const ROLES = ['owner', 'admin', 'member'] as const

function roleBadgeColor(role: string) {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-700'
    case 'admin':
      return 'bg-blue-100 text-blue-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function avatarInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function TeamPage() {
  const { data: me } = useMe()
  const { data: members = [], isLoading } = useOrgMembers()
  const inviteMember = useInviteMember()
  const updateRole = useUpdateMemberRole()
  const deactivateMember = useDeactivateMember()
  const resendInvitation = useResendInvitation()
  const revokeInvitation = useRevokeInvitation()

  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('member')

  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [roleTarget, setRoleTarget] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<string>('member')

  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<User | null>(null)

  const isAdmin = me?.role === UserRole.ADMIN

  const activeMembers = useMemo(
    () => members.filter((m) => m.isActive),
    [members],
  )
  const pendingMembers = useMemo(
    () => members.filter((m) => !m.isActive),
    [members],
  )

  const handleInvite = () => {
    if (!inviteEmail.trim()) return
    inviteMember.mutate(
      {
        email: inviteEmail.trim(),
        displayName: inviteDisplayName.trim() || undefined,
        role: inviteRole,
      },
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
    setNewRole(member.role)
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

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Active Members */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Active Members ({activeMembers.length})
          </h2>
          {activeMembers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="No active members"
              description="Invite team members to get started."
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {activeMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600 flex-shrink-0">
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

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {member.displayName}
                      </span>
                      {member.id === me?.id && (
                        <span className="text-xs text-gray-400">(you)</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{member.email}</p>
                  </div>

                  {/* Role badge */}
                  <Badge className={roleBadgeColor(member.role)}>
                    {member.role}
                  </Badge>

                  {/* Actions */}
                  {isAdmin && member.id !== me?.id && (
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
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending Invitations */}
        {pendingMembers.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Pending Invitations ({pendingMembers.length})
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {pendingMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      Invited as {member.role}
                    </p>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
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
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onClose={() => setShowInviteDialog(false)}>
        <DialogHeader onClose={() => setShowInviteDialog(false)}>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Input
            label="Display Name (optional)"
            placeholder="Jane Doe"
            value={inviteDisplayName}
            onChange={(e) => setInviteDisplayName(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
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
            Send Invitation
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={showRoleDialog} onClose={() => setShowRoleDialog(false)}>
        <DialogHeader onClose={() => setShowRoleDialog(false)}>
          <DialogTitle>Change Role</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-gray-600 mb-4">
            Change role for <strong>{roleTarget?.displayName}</strong>
          </p>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRoleChange}
            isLoading={updateRole.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Deactivate confirmation */}
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
        description={`Are you sure you want to deactivate ${deactivateTarget?.displayName}? They will no longer be able to access the organization.`}
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivateMember.isPending}
      />

      {/* Revoke invitation confirmation */}
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
        description={`Are you sure you want to revoke the invitation for ${revokeTarget?.email}?`}
        confirmLabel="Revoke"
        destructive
        isLoading={revokeInvitation.isPending}
      />
    </div>
  )
}
