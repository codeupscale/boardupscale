import { cn, getInitials, generateAvatarColor } from '@/lib/utils'
import { User } from '@/types'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

interface AvatarProps {
  user?: Partial<User> | null
  name?: string
  src?: string
  size?: AvatarSize
  className?: string
}

const sizes: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}

export function Avatar({ user, name, src, size = 'md', className }: AvatarProps) {
  const displayName = name || user?.displayName || 'Unknown'
  const avatarSrc = src || user?.avatarUrl
  const initials = getInitials(displayName)
  const colorClass = generateAvatarColor(displayName)

  return (
    <AvatarPrimitive.Root
      className={cn(
        'rounded-full flex-shrink-0 overflow-hidden inline-flex',
        sizes[size],
        className,
      )}
    >
      <AvatarPrimitive.Image
        src={avatarSrc}
        alt={displayName}
        className="h-full w-full object-cover"
      />
      <AvatarPrimitive.Fallback
        className={cn(
          'flex h-full w-full items-center justify-center rounded-full text-white font-medium',
          colorClass,
        )}
        title={displayName}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

interface AvatarGroupProps {
  users: Partial<User>[]
  max?: number
  size?: AvatarSize
}

export function AvatarGroup({ users, max = 3, size = 'sm' }: AvatarGroupProps) {
  const visible = users.slice(0, max)
  const extra = users.length - max

  return (
    <div className="flex -space-x-2">
      {visible.map((user, i) => (
        <Avatar
          key={user.id || i}
          user={user}
          size={size}
          className="ring-2 ring-white dark:ring-gray-900"
        />
      ))}
      {extra > 0 && (
        <div
          className={cn(
            'rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium ring-2 ring-white dark:ring-gray-900 text-xs',
            sizes[size],
          )}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}
