import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'full' | 'icon'
  className?: string
}

const sizes = {
  xs: { icon: 20, text: 'text-sm', gap: 'gap-1.5' },
  sm: { icon: 28, text: 'text-base', gap: 'gap-2' },
  md: { icon: 36, text: 'text-xl', gap: 'gap-2.5' },
  lg: { icon: 48, text: 'text-2xl', gap: 'gap-3' },
  xl: { icon: 64, text: 'text-3xl', gap: 'gap-4' },
}

export function Logo({ size = 'md', variant = 'full', className }: LogoProps) {
  const { icon: iconSize, text: textSize, gap } = sizes[size]

  return (
    <div className={cn('flex items-center', gap, className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        role="img"
      >
        <defs>
          <linearGradient id="bu-logo-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect width="32" height="32" rx="7" fill="url(#bu-logo-grad)" />

        {/* Kanban columns — ascending left to right (board + upscale) */}
        <rect x="6"   y="20" width="5" height="7" rx="1.5" fill="white" fillOpacity="0.55" />
        <rect x="13.5" y="14" width="5" height="13" rx="1.5" fill="white" fillOpacity="0.78" />
        <rect x="21"  y="8"  width="5" height="19" rx="1.5" fill="white" />

        {/* Upward arrow above tallest column */}
        <path
          d="M23.5 6.5 L21.5 8.5"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M23.5 6.5 L25.5 8.5"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>

      {variant === 'full' && (
        <span
          className={cn(
            'font-bold tracking-tight text-gray-900 dark:text-gray-100 select-none',
            textSize,
          )}
        >
          Board<span className="text-blue-600 dark:text-blue-400">upscale</span>
        </span>
      )}
    </div>
  )
}
