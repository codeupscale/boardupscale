import { ShieldX, UserPlus, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useHasPermission } from '@/hooks/useHasPermission'
import { useAddProjectMember } from '@/hooks/useProjects'
import { useProject } from '@/hooks/useProjects'
import { UserRole } from '@/types'

interface ProjectMemberGuardProps {
  /** Project key (slug) from the URL, e.g. "MY-PROJ" */
  projectKey: string
  children: React.ReactNode
}

/**
 * Guards project content pages so that:
 *  - Org Owners always pass through (full bypass).
 *  - Org Admins must be an explicit project member to see content.
 *    If they are not a member they see a clear "Access Restricted" screen
 *    with a one-click "Join Project" button that adds them as Manager.
 *  - All other roles pass through (project-level permission checks are
 *    already enforced by the backend; the UI renders only what they can see).
 */
export function ProjectMemberGuard({ projectKey, children }: ProjectMemberGuardProps) {
  const user = useAuthStore((s) => s.user)
  const { hasPermission, isLoading } = useHasPermission(projectKey)
  const { data: project } = useProject(projectKey)
  const addMember = useAddProjectMember()

  // Only Admins are subject to the project-membership gate.
  // Owners bypass everything; other roles are not affected here.
  const isAdmin = user?.role === UserRole.ADMIN
  if (!isAdmin) return <>{children}</>

  // Wait for permissions to load before deciding.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // `board:read` is NOT in the admin-exempt resources list on the backend.
  // If the admin has it, they are a project member → let them through.
  const isMember = hasPermission('board', 'read')
  if (isMember) return <>{children}</>

  // Admin is NOT a project member — show the access gate.
  const handleJoin = () => {
    if (!project || !user) return
    addMember.mutate(
      { projectId: project.id, userId: user.id, role: 'manager' },
      {
        onSuccess: () => {
          // Reload the page so all queries re-fetch with the new membership.
          window.location.reload()
        },
      },
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
        <ShieldX className="h-8 w-8 text-amber-600 dark:text-amber-400" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-semibold text-foreground">
          You're not a project member
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          As an <span className="font-medium text-foreground">Admin</span> you can see
          this project in the list, but you need to join it before you can access
          its board, issues, and other content.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleJoin}
          disabled={addMember.isPending || !project}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {addMember.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Join as Manager
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        You can also be added by a project member via{' '}
        <span className="font-medium">Project Settings → Members</span>.
      </p>
    </div>
  )
}
