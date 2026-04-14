import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'full' | 'icon'
  className?: string
}

const sizes = {
  xs: { icon: 20, text: 'text-sm',  gap: 'gap-1.5' },
  sm: { icon: 28, text: 'text-base', gap: 'gap-2' },
  md: { icon: 36, text: 'text-xl',  gap: 'gap-2.5' },
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
          {/* Plasma gradient — matches the primary button exactly */}
          <linearGradient id="bu-plasma-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#000000" />
            <stop offset="28%"  stopColor="#000000" />
            <stop offset="60%"  stopColor="#1a0a1e" />
            <stop offset="100%" stopColor="#6b1466" />
          </linearGradient>

          {/* Subtle top-left glass sheen */}
          <linearGradient id="bu-sheen" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity="0.12" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          {/* Clip to rounded rect */}
          <clipPath id="bu-clip">
            <rect width="32" height="32" rx="7" />
          </clipPath>
        </defs>

        {/* Base */}
        <rect width="32" height="32" rx="7" fill="url(#bu-plasma-bg)" />

        {/* Glass sheen */}
        <g clipPath="url(#bu-clip)">
          <rect width="32" height="32" fill="url(#bu-sheen)" />
        </g>

        {/* Kanban bars — ascending left-to-right (board + upscale concept) */}
        <rect x="6"    y="20" width="5" height="7"  rx="1.5" fill="white" fillOpacity="0.42" />
        <rect x="13.5" y="14" width="5" height="13" rx="1.5" fill="white" fillOpacity="0.70" />
        <rect x="21"   y="8"  width="5" height="19" rx="1.5" fill="white" />

        {/* Upward chevron above the tallest bar */}
        <path d="M23.5 5.5 L21.2 7.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M23.5 5.5 L25.8 7.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      </svg>

      {variant === 'full' && (
        <span className={cn('font-bold tracking-tight select-none', textSize)}>
          <span className="text-foreground">Board</span>
          <span className="logo-upscale-text">upscale</span>
        </span>
      )}
    </div>
  )
}
