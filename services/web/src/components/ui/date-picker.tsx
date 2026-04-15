import { useId } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from './label'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Calendar } from './calendar'

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
  const generatedId = useId()
  const inputId = label ? `datepicker-${generatedId}` : undefined
  const selectedDate = value ? parseISO(value) : undefined

  const handleSelect = (day: Date | undefined) => {
    onChange(day ? format(day, 'yyyy-MM-dd') : undefined)
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label htmlFor={inputId} className="mb-1">
          {label}
        </Label>
      )}
      <div className="relative">
        <Popover>
          <PopoverTrigger asChild>
            <button
              id={inputId}
              type="button"
              disabled={disabled}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                !value ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              <CalendarDays className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate pr-6">
                {selectedDate ? format(selectedDate, 'MMM d, yyyy') : placeholder}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto min-w-[280px] p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {value && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange(undefined)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded z-10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
