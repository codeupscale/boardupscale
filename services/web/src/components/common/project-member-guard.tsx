import { ShieldX, Loader2 } from 'lucide-react'
import { useHasPermission } from '@/hooks/useHasPermission'
import { useAuthStore } from '@/store/auth.store'
import { UserRole } from '@/types'

interface ProjectMemberGuardProps {
  /** Project key (slug) from the URL, e.g. "MY-PROJ" */
  projectKey: string
  children: React.ReactNode
}

/**
 * Guards project content pages.
 *
 * CSV "Enter without membership": Owner ✅ / Admin ✅ / Member — / Viewer —
 *
 * - Owner & Admin always pass through (full bypass via permissions service).
 * - Member & Viewer must be explicitly added to the project; if not, they see
 *   a friendly "not a project member" wall instead of a broken page.
 */
export function ProjectMemberGuard({ projectKey, children }: ProjectMemberGuardProps) {
  const user = useAuthStore((s) => s.user)
  const { hasPermission, isLoading } = useHasPermission(projectKey)

  // Owner/admin: permissions service returns all perms regardless of membership.
  const isOrgAdmin = user?.role === UserRole.OWNER || user?.role === UserRole.ADMINISTRATOR
  if (isOrgAdmin) return <>{children}</>

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // A project member will have at minimum board:read in their permission set.
  if (!hasPermission('board', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <ShieldX className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-foreground">You're not a member of this project</p>
        <p className="text-sm text-muted-foreground">
          Ask a project admin to add you to access this project's content.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
