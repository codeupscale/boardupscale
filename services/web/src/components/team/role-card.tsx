import type { ComponentType } from 'react'
import {
  CheckCircle2,
  Crown,
  Shield,
  ShieldCheck,
  User2,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RoleCardConfig {
  value: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  iconColor: string
  selectedBg: string
  defaultBg: string
  badgeCls: string
}

export const ROLE_STYLE_MAP: Record<
  string,
  Omit<RoleCardConfig, 'value' | 'label' | 'description'>
> = {
  owner: {
    icon: Crown,
    iconColor: 'text-purple-500',
    selectedBg:
      'bg-purple-50 dark:bg-purple-900/20 border-purple-400 dark:border-purple-600',
    defaultBg: 'bg-card/50 border-border',
    badgeCls:
      'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
  },
  user: {
    icon: User2,
    iconColor: 'text-muted-foreground',
    selectedBg: 'bg-muted border-muted-foreground',
    defaultBg: 'bg-card/50 border-border',
    badgeCls: 'bg-muted text-foreground border border-border',
  },
  admin: {
    icon: Shield,
    iconColor: 'text-primary',
    selectedBg: 'bg-primary/10 border-primary dark:border-primary',
    defaultBg: 'bg-card/50 border-border',
    badgeCls:
      'bg-primary/15 text-primary border border-primary/30 dark:border-primary/40',
  },
  administrator: {
    icon: Shield,
    iconColor: 'text-primary',
    selectedBg: 'bg-primary/10 border-primary dark:border-primary',
    defaultBg: 'bg-card/50 border-border',
    badgeCls:
      'bg-primary/15 text-primary border border-primary/30 dark:border-primary/40',
  },
  manager: {
    icon: ShieldCheck,
    iconColor: 'text-blue-500',
    selectedBg:
      'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600',
    defaultBg: 'bg-card/50 border-border',
    badgeCls:
      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700',
  },
  member: {
    icon: User2,
    iconColor: 'text-muted-foreground',
    selectedBg: 'bg-muted border-muted-foreground',
    defaultBg: 'bg-card/50 border-border',
    badgeCls: 'bg-muted text-foreground border border-border',
  },
  viewer: {
    icon: Users,
    iconColor: 'text-muted-foreground',
    selectedBg: 'bg-muted border-muted-foreground',
    defaultBg: 'bg-card/50 border-border',
    badgeCls: 'bg-muted text-foreground border border-border',
  },
}

export const DEFAULT_ROLE_STYLE: Omit<
  RoleCardConfig,
  'value' | 'label' | 'description'
> = {
  icon: User2,
  iconColor: 'text-muted-foreground',
  selectedBg: 'bg-muted border-muted-foreground',
  defaultBg: 'bg-card/50 border-border',
  badgeCls: 'bg-muted text-foreground border border-border',
}

export function getRoleConfig(role: string): RoleCardConfig {
  const key = role.toLowerCase()
  const style = ROLE_STYLE_MAP[key] ?? DEFAULT_ROLE_STYLE
  const label = role.charAt(0).toUpperCase() + role.slice(1)
  return { value: key, label, description: '', ...style }
}

export function RoleCard({
  config,
  selected,
  onClick,
}: {
  config: RoleCardConfig
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
        'hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:ring-offset-2 focus:ring-offset-background',
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center',
          selected ? 'bg-card/60' : 'bg-muted',
        )}
      >
        <Icon className={cn('h-4 w-4', config.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {config.label}
          </span>
          {selected && (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {config.description}
        </p>
      </div>
    </button>
  )
}
