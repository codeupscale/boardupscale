import { cn } from '@/lib/utils'

/* ──────────────────────────── Primitives ──────────────────────────── */

export function Skeleton({
  className,
  circle,
  style,
}: {
  className?: string
  circle?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        circle ? 'rounded-full' : 'rounded-md',
        className,
      )}
      style={style}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, var(--shimmer-highlight, rgba(255,255,255,0.4)) 50%, transparent 100%)',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }}
      />
    </div>
  )
}

export function SkeletonRow({
  index,
  children,
  className,
}: {
  index: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('animate-in fade-in duration-300 fill-mode-both', className)}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {children}
    </div>
  )
}

export function ContentFade({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('animate-in fade-in duration-300', className)}>
      {children}
    </div>
  )
}

/* ──────────────────────────── Templates ──────────────────────────── */

const WIDTH_PATTERN = ['85%', '70%', '90%', '60%', '75%', '80%', '65%', '72%']

export function TableSkeleton({
  rows = 8,
  showFilters = true,
}: {
  rows?: number
  showFilters?: boolean
}) {
  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      )}

      <div className="rounded-lg border">
        {/* Header */}
        <div className="flex items-center gap-4 bg-muted/30 px-4 py-3">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>

        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} index={i}>
            <div className="flex items-center gap-4 border-t px-4 py-3">
              <Skeleton className="h-8 w-8" circle />
              <Skeleton
                className="h-4 flex-1"
                style={{ maxWidth: WIDTH_PATTERN[i % WIDTH_PATTERN.length] }}
              />
              <Skeleton className="h-5 w-16" circle />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </SkeletonRow>
        ))}
      </div>
    </div>
  )
}

const CARDS_PER_COLUMN = [3, 4, 2, 3]

export function KanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {Array.from({ length: columns }).map((_, colIdx) => (
        <SkeletonRow key={colIdx} index={colIdx}>
          <div className="w-[280px] flex-shrink-0 space-y-3">
            {/* Column header */}
            <div className="flex items-center justify-between px-1">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-6" circle />
            </div>

            {/* Cards */}
            {Array.from({
              length: CARDS_PER_COLUMN[colIdx % CARDS_PER_COLUMN.length],
            }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="rounded-xl border bg-card p-3 space-y-2"
              >
                <Skeleton
                  className="h-4"
                  style={{ width: `${75 - 10 * cardIdx}%` }}
                />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex items-center gap-2 pt-1">
                  <Skeleton className="h-6 w-6" circle />
                  <Skeleton className="h-4 w-12" circle />
                </div>
              </div>
            ))}
          </div>
        </SkeletonRow>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left — main content */}
      <div className="flex-1 space-y-6 p-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-20" />
        </div>

        {/* Title */}
        <Skeleton className="h-8 w-3/4" />

        {/* Description lines */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[75%]" />
        </div>
        <Skeleton className="h-4 w-[60%]" />

        {/* Comments */}
        {[0, 1].map((ci) => (
          <div key={ci} className="space-y-2 pt-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8" circle />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="space-y-1 pl-11">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[80%]" />
            </div>
          </div>
        ))}
      </div>

      {/* Right sidebar */}
      <div className="w-full lg:w-80 xl:w-[340px] border-l p-4 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardGridSkeleton({
  stats = 3,
  cards = 6,
  columns = 3,
}: {
  stats?: number
  cards?: number
  columns?: number
}) {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${stats}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: stats }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10" circle />
            <div className="space-y-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonRow key={i} index={i}>
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-3" style={{ width: '80%' }} />
              <Skeleton className="h-3" style={{ width: '55%' }} />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-14" circle />
                <Skeleton className="h-5 w-12" circle />
              </div>
            </div>
          </SkeletonRow>
        ))}
      </div>
    </div>
  )
}

export function SettingsSkeleton({
  showNav = true,
  fields = 4,
}: {
  showNav?: boolean
  fields?: number
}) {
  return (
    <div className="flex gap-8 p-6">
      {/* Left nav */}
      {showNav && (
        <div className="hidden md:block w-48 space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn('h-9 w-full rounded-lg', i === 0 && 'bg-primary/10')}
            />
          ))}
        </div>
      )}

      {/* Right content */}
      <div className="flex-1 max-w-2xl space-y-6">
        <Skeleton className="h-6 w-48" />
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  )
}

export function TeamSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} index={i}>
            <div
              className={cn(
                'flex items-center gap-4 px-4 py-3',
                i > 0 && 'border-t',
              )}
            >
              <Skeleton className="h-10 w-10" circle />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-5 w-16" circle />
              <div className="ml-auto">
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          </SkeletonRow>
        ))}
      </div>
    </div>
  )
}

export function ChartSkeleton({
  height = 'h-[400px]',
}: {
  height?: string
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex">
        {/* Y-axis ticks */}
        <div className="flex flex-col justify-between pr-2" style={{ minHeight: 300 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>

        {/* Chart area */}
        <div className={cn('relative flex-1 rounded-lg border', height)}>
          {[20, 40, 60, 80].map((pct) => (
            <div
              key={pct}
              className="absolute left-0 right-0 border-t border-dashed border-muted"
              style={{ top: `${pct}%` }}
            />
          ))}
          <Skeleton className="absolute inset-2 opacity-30" />
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between pl-12">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-10" />
        ))}
      </div>
    </div>
  )
}

export function CalendarSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-8 mx-auto" />
        ))}
      </div>

      {/* Week rows */}
      {Array.from({ length: 5 }).map((_, weekIdx) => (
        <SkeletonRow key={weekIdx} index={weekIdx}>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, dayIdx) => {
              const day = weekIdx * 7 + dayIdx
              return (
                <div key={dayIdx} className="h-24 rounded-lg border p-2 space-y-1">
                  <Skeleton className="h-3 w-4" />
                  {day % 3 === 0 && <Skeleton className="h-4 rounded-full" />}
                  {day % 4 === 0 && <Skeleton className="h-4 rounded-full" />}
                </div>
              )
            })}
          </div>
        </SkeletonRow>
      ))}
    </div>
  )
}

const LIST_WIDTHS = ['80%', '65%', '90%', '70%', '85%', '60%']

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} index={i}>
          <div className="flex items-start gap-3 py-4 px-2">
            <Skeleton className="h-9 w-9" circle />
            <div className="flex-1 space-y-1">
              <Skeleton
                className="h-4"
                style={{ width: LIST_WIDTHS[i % LIST_WIDTHS.length] }}
              />
              <Skeleton className="h-3 w-[50%]" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        </SkeletonRow>
      ))}
    </div>
  )
}
