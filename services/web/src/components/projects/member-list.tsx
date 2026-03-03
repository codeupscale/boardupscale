import { Trash2 } from 'lucide-react'
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

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
]

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
}

export function MemberList({ projectId, members }: MemberListProps) {
  const removeMember = useRemoveProjectMember()
  const currentUser = useAuthStore((s) => s.user)

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">No members yet.</div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-4 py-3">
          <Avatar user={member.user} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{member.user.displayName}</p>
            <p className="text-xs text-gray-500 truncate">{member.user.email}</p>
          </div>
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              roleColors[member.role] || roleColors.member,
            )}
          >
            {member.role}
          </span>
          {currentUser?.id !== member.userId && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                removeMember.mutate({ projectId, memberId: member.id })
              }
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
