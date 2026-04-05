import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
  className?: string
}

function getPageWindow(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis')[] = []
  const delta = 2

  const rangeStart = Math.max(2, page - delta)
  const rangeEnd = Math.min(totalPages - 1, page + delta)

  pages.push(1)

  if (rangeStart > 2) {
    pages.push('ellipsis')
  }

  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i)
  }

  if (rangeEnd < totalPages - 1) {
    pages.push('ellipsis')
  }

  pages.push(totalPages)

  return pages
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1 && total <= limit) return null

  const from = Math.min((page - 1) * limit + 1, total)
  const to = Math.min(page * limit, total)
  const pageWindow = getPageWindow(page, totalPages)

  const btnBase =
    'inline-flex items-center justify-center h-8 min-w-[2rem] px-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3',
        'border-t border-gray-200 dark:border-gray-700',
        className,
      )}
      role="navigation"
      aria-label="Pagination"
    >
      {/* Results summary */}
      <p className="text-sm text-gray-500 dark:text-gray-400 shrink-0">
        Showing{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">{from}</span>
        {' – '}
        <span className="font-medium text-gray-700 dark:text-gray-300">{to}</span>
        {' of '}
        <span className="font-medium text-gray-700 dark:text-gray-300">{total}</span>{' '}
        results
      </p>

      {/* Page controls */}
      <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
        {/* First page */}
        <button
          className={cn(
            btnBase,
            'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          aria-label="First page"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        {/* Previous page */}
        <button
          className={cn(
            btnBase,
            'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page numbers */}
        {pageWindow.map((item, idx) => {
          if (item === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${idx}`}
                className="inline-flex items-center justify-center h-8 w-8 text-sm text-gray-400 dark:text-gray-500 select-none"
                aria-hidden="true"
              >
                &hellip;
              </span>
            )
          }

          const isActive = item === page
          return (
            <button
              key={item}
              className={cn(btnBase, 'min-w-[2rem]', {
                'bg-blue-600 text-white shadow-sm hover:bg-blue-700': isActive,
                'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800':
                  !isActive,
              })}
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {item}
            </button>
          )
        })}

        {/* Next page */}
        <button
          className={cn(
            btnBase,
            'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Last page */}
        <button
          className={cn(
            btnBase,
            'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="Last page"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
