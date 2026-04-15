import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { UserRole } from '@/types'

interface RoleGuardProps {
  roles: UserRole[]
  children: React.ReactNode
  redirectTo?: string
}

export function RoleGuard({ roles, children, redirectTo = '/dashboard' }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user)

  if (!user) return null

  if (!roles.includes(user.role as UserRole)) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
