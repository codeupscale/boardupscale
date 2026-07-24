import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Mail, UserPlus } from 'lucide-react'
import { useMe } from '@/hooks/useAuth'
import { useInviteMember } from '@/hooks/useOrganization'
import { useRoles } from '@/hooks/usePermissions'
import { UserRole } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DEFAULT_ROLE_STYLE,
  ROLE_STYLE_MAP,
  RoleCard,
  type RoleCardConfig,
} from '@/components/team/role-card'

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Shared invite-member modal (Team settings + Org Owner dashboard). */
export function InviteMemberDialog({
  open,
  onOpenChange,
}: InviteMemberDialogProps) {
  const { data: me } = useMe()
  const inviteMember = useInviteMember()
  const { data: orgRoles = [] } = useRoles(me?.organizationId, 'org')
  const isOwner = me?.role === UserRole.OWNER

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteRole, setInviteRole] = useState('user')
  const [showForceCreateConfirm, setShowForceCreateConfirm] = useState(false)
  const [pendingInvitePayload, setPendingInvitePayload] = useState<{
    email: string
    displayName?: string
    role: string
  } | null>(null)

  const assignableRoles = useMemo<RoleCardConfig[]>(
    () =>
      orgRoles
        .filter((r) => isOwner || r.name.toLowerCase() !== 'owner')
        .map((r) => {
          const key = r.name.toLowerCase()
          const style = ROLE_STYLE_MAP[key] ?? DEFAULT_ROLE_STYLE
          return {
            value: key,
            label: r.name,
            description: r.description || '',
            ...style,
          }
        }),
    [orgRoles, isOwner],
  )

  useEffect(() => {
    if (!open) {
      setInviteEmail('')
      setInviteDisplayName('')
      setInviteRole('user')
      setShowForceCreateConfirm(false)
      setPendingInvitePayload(null)
    }
  }, [open])

  const resetAndClose = () => {
    onOpenChange(false)
  }

  const handleInvite = () => {
    if (!inviteEmail.trim()) return
    inviteMember.mutate(
      {
        email: inviteEmail.trim(),
        displayName: inviteDisplayName.trim() || undefined,
        role: inviteRole,
      },
      {
        onSuccess: () => resetAndClose(),
        onError: (err: unknown) => {
          const code = (err as { response?: { data?: { code?: string } } })
            ?.response?.data?.code
          if (code === 'JIRA_MERGE_REQUIRED') {
            setPendingInvitePayload({
              email: inviteEmail.trim(),
              displayName: inviteDisplayName.trim() || undefined,
              role: inviteRole,
            })
            setShowForceCreateConfirm(true)
          }
        },
      },
    )
  }

  const handleForceCreate = () => {
    if (!pendingInvitePayload) return
    inviteMember.mutate(
      { ...pendingInvitePayload, forceCreate: true },
      {
        onSuccess: () => {
          setShowForceCreateConfirm(false)
          setPendingInvitePayload(null)
          resetAndClose()
        },
        onError: () => {
          setShowForceCreateConfirm(false)
        },
      },
    )
  }

  return (
    <>
      <Dialog
        open={open && !showForceCreateConfirm}
        onOpenChange={(isOpen) => {
          if (!isOpen) onOpenChange(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle>Invite Team Member</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  They&apos;ll receive an email with a link to join
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
                {assignableRoles.map((conf) => (
                  <RoleCard
                    key={conf.value}
                    config={conf}
                    selected={inviteRole === conf.value}
                    onClick={() => setInviteRole(conf.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
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

      <Dialog
        open={showForceCreateConfirm}
        onOpenChange={(o) => {
          if (!o) {
            setShowForceCreateConfirm(false)
            setPendingInvitePayload(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <DialogTitle>Jira Placeholder Users Exist</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This organisation has unresolved Jira placeholder accounts
                </p>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your organisation has Jira placeholder users that haven&apos;t been
            matched to real accounts yet. If{' '}
            <span className="font-medium text-foreground">
              {pendingInvitePayload?.email}
            </span>{' '}
            was imported from Jira, consider merging them instead of creating a
            duplicate account.
          </p>
          <p className="text-sm text-muted-foreground">
            Add{' '}
            <span className="font-medium text-foreground">
              {pendingInvitePayload?.email}
            </span>{' '}
            as a brand-new member anyway?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForceCreateConfirm(false)
                setPendingInvitePayload(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleForceCreate}
              isLoading={inviteMember.isPending}
            >
              <UserPlus className="h-4 w-4" />
              Add as New Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
