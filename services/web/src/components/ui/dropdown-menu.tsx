import { ReactNode, useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}

export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-block">
      <div
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="cursor-pointer"
      >
        {trigger}
      </div>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-1 w-48 bg-white dark:bg-[var(--plasma-surface)] rounded-lg shadow-lg dark:shadow-2xl dark:shadow-black/40 border border-[var(--plasma-border)] py-1',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface DropdownItemProps {
  children: ReactNode
  onClick?: () => void
  className?: string
  destructive?: boolean
  disabled?: boolean
  icon?: ReactNode
}

export function DropdownItem({
  children,
  onClick,
  className,
  destructive,
  disabled,
  icon,
}: DropdownItemProps) {
  return (
    <button
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors text-left',
        destructive
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-gray-700 dark:text-gray-300 hover:bg-[var(--plasma-hover)]',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      onClick={disabled ? undefined : onClick}
    >
      {icon && <span className="h-4 w-4 flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-[var(--plasma-border)]" />
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
      {children}
    </div>
  )
}
