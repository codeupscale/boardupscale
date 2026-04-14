import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ProjectMember, UserRole } from '@/types'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useRemoveProjectMember } from '@/hooks/useProjects'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

interface MemberListProps {
  projectId: string
  members: ProjectMember[]
}

const roleKeys: Record<string, string> = {
  admin: 'settings.admin',
  manager: 'settings.manager',
  member: 'projects.member',
  viewer: 'settings.viewer',
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  member: 'bg-primary/10 text-primary',
  viewer: 'bg-muted text-muted-foreground',
}

export function MemberList({ projectId, members }: MemberListProps) {
  const { t } = useTranslation()
  const removeMember = useRemoveProjectMember()
  const currentUser = useAuthStore((s) => s.user)

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">{t('projects.noMembers')}</div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-4 py-3">
          <Avatar user={member.user} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{member.user.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
          </div>
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              roleColors[member.role] || roleColors.member,
            )}
          >
            {t(roleKeys[member.role] || 'projects.member')}
          </span>
          {currentUser?.id !== member.userId && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                removeMember.mutate({ projectId, memberId: member.id })
              }
              className="text-muted-foreground hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
