import { ShieldX } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { UserRole } from '@/types'

interface RoleGuardProps {
  roles: UserRole[]
  children: React.ReactNode
  redirectTo?: string
}

export function RoleGuard({ roles, children }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user)

  if (!user) return null

  if (!roles.includes(user.role as UserRole)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
          <ShieldX className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You don't have permission to view this page. This area is restricted to{' '}
            <span className="font-medium text-foreground">
              {roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(' and ')}
            </span>{' '}
            only. Contact your organization owner if you believe this is a mistake.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
