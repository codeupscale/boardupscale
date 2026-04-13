// services/web/src/components/ui/date-picker.tsx
import { useState, useRef, useEffect } from 'react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isToday,
  isSameDay,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface DatePickerProps {
  value?: string
  onChange: (date: string | undefined) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  label,
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() =>
    value ? parseISO(value) : new Date(),
  )
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parseISO(value) : undefined

  // Sync view month when value changes externally
  useEffect(() => {
    if (value) setViewDate(parseISO(value))
  }, [value])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const firstDayOffset = getDay(monthStart)

  const handleSelectDay = (day: Date) => {
    const iso = format(day, 'yyyy-MM-dd')
    if (selectedDate && isSameDay(day, selectedDate)) {
      onChange(undefined)
    } else {
      onChange(iso)
    }
    setOpen(false)
  }

  const inputId = label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {label}
        </label>
      )}
      <button
        id={inputId}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:text-gray-500 disabled:cursor-not-allowed',
          !value && 'text-gray-400 dark:text-gray-500',
          value && 'text-gray-900 dark:text-gray-100',
        )}
      >
        <CalendarDays className="h-4 w-4 flex-shrink-0 text-gray-400" />
        <span className="flex-1 truncate">
          {selectedDate ? format(selectedDate, 'MMM d, yyyy') : placeholder}
        </span>
        {value && (
          <span
            role="button"
            aria-label="Clear date"
            onClick={(e) => { e.stopPropagation(); onChange(undefined) }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg dark:shadow-2xl dark:shadow-black/40 p-3 w-64">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {days.map((day) => {
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
              const isTodayDay = isToday(day)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    'h-8 w-8 mx-auto flex items-center justify-center rounded-full text-sm transition-colors',
                    isSelected && 'bg-blue-600 text-white font-semibold',
                    !isSelected && isTodayDay && 'ring-2 ring-blue-500 text-blue-600 dark:text-blue-400 font-semibold',
                    !isSelected && !isTodayDay && 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
