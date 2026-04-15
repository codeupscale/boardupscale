import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
}

export function Spinner({ className }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin', className)} />
}

/**
 * Full-page skeleton shown while lazy-loaded route chunks download.
 * Mimics a typical page layout (header bar + content area) so the
 * transition feels seamless instead of a jarring blank-screen spinner.
 */
export function LoadingPage() {
  return (
    <div className="w-full h-full min-h-[400px] animate-in fade-in duration-300">
      {/* Page header skeleton */}
      <div className="px-6 pt-6 pb-4 space-y-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <div className="h-3 w-12 rounded bg-muted shimmer-block" />
          <div className="h-3 w-3 rounded bg-muted shimmer-block" />
          <div className="h-3 w-20 rounded bg-muted shimmer-block" />
        </div>
        {/* Title */}
        <div className="h-7 w-56 rounded-md bg-muted shimmer-block" />
        {/* Tab nav */}
        <div className="flex gap-4 pt-1">
          <div className="h-4 w-14 rounded bg-muted shimmer-block" />
          <div className="h-4 w-16 rounded bg-muted shimmer-block" />
          <div className="h-4 w-12 rounded bg-muted shimmer-block" />
          <div className="h-4 w-16 rounded bg-muted shimmer-block" />
        </div>
      </div>

      {/* Content area skeleton */}
      <div className="px-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg border border-border/50 px-4 py-3"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="h-8 w-8 rounded-full bg-muted shimmer-block" />
            <div
              className="h-4 rounded bg-muted shimmer-block"
              style={{ width: `${70 - i * 6}%` }}
            />
            <div className="h-5 w-14 rounded-full bg-muted shimmer-block ml-auto" />
            <div className="h-4 w-16 rounded bg-muted shimmer-block" />
          </div>
        ))}
      </div>
    </div>
  )
}
