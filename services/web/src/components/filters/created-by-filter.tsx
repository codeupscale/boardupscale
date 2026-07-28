import { useMemo, Fragment } from 'react'
import { UserRound, CalendarRange } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ProjectMember } from '@/types'
import { cn } from '@/lib/utils'
import {
  CREATED_RANGE_PRESET_OPTIONS,
  CreatedRangePreset,
  matchCreatedRangePreset,
  resolveCreatedRangePreset,
  withReporterFilterChange,
} from '@/lib/issue-created-range'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

export type CreatedByFilterValue = {
  reporterId?: string
  createdFrom?: string
  createdTo?: string
}

interface CreatedByFilterControlsProps {
  value: CreatedByFilterValue
  onChange: (next: CreatedByFilterValue) => void
  members: ProjectMember[]
  /** compact matches board/backlog quick filters; form matches issues page selects */
  variant?: 'compact' | 'form'
  className?: string
}

export function CreatedByFilterControls({
  value,
  onChange,
  members = [],
  variant = 'compact',
  className,
}: CreatedByFilterControlsProps) {
  const { t } = useTranslation()

  const matchedPreset = useMemo(
    () => matchCreatedRangePreset(value.createdFrom, value.createdTo),
    [value.createdFrom, value.createdTo],
  )

  // Only preset bounds are valid — ignore stale custom ranges from URL/bookmarks
  const safeValue: CreatedByFilterValue = matchedPreset
    ? value
    : { reporterId: value.reporterId, createdFrom: undefined, createdTo: undefined }

  const rangeSelectValue = matchedPreset ?? '__none__'

  const emit = (partial: CreatedByFilterValue) => {
    onChange({
      reporterId: partial.reporterId,
      createdFrom: partial.createdFrom,
      createdTo: partial.createdTo,
    })
  }

  const handleReporterChange = (raw: string) => {
    const reporterId = raw === '__all__' ? undefined : raw
    emit(withReporterFilterChange(reporterId, safeValue))
  }

  const handlePresetChange = (raw: string) => {
    if (raw === '__none__') {
      emit({
        reporterId: value.reporterId,
        createdFrom: undefined,
        createdTo: undefined,
      })
      return
    }
    const range = resolveCreatedRangePreset(raw as CreatedRangePreset)
    emit({
      reporterId: value.reporterId,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    })
  }

  const triggerClass =
    variant === 'compact'
      ? cn(
          'w-auto gap-1.5 text-sm',
          value.reporterId
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'text-muted-foreground',
        )
      : 'w-40'

  const rangeTriggerClass =
    variant === 'compact'
      ? cn(
          'w-auto gap-1.5 text-sm',
          matchedPreset
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'text-muted-foreground',
        )
      : 'w-44'

  const controls = (
    <>
      <Select
        value={value.reporterId || '__all__'}
        onValueChange={handleReporterChange}
      >
        <SelectTrigger className={triggerClass}>
          {variant === 'compact' && <UserRound className="h-3.5 w-3.5 shrink-0" />}
          <SelectValue placeholder={t('filters.createdBy', 'Created by')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">
            {t('filters.createdBy', 'Created by')}
          </SelectItem>
          {members
            .filter((member) => !!member.userId)
            .map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.user?.displayName || member.userId}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {!!value.reporterId && (
        <Select
          value={rangeSelectValue}
          onValueChange={handlePresetChange}
        >
          <SelectTrigger className={rangeTriggerClass}>
            {variant === 'compact' && <CalendarRange className="h-3.5 w-3.5 shrink-0" />}
            <SelectValue placeholder={t('filters.timeRange', 'Time range')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              {t('filters.anyTime', 'Any time')}
            </SelectItem>
            {CREATED_RANGE_PRESET_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  )

  if (variant === 'compact') {
    return <Fragment>{controls}</Fragment>
  }

  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{controls}</div>
}

/** Count Created By (+ optional date) toward active filter badges. */
export function countCreatedByFilters(value: CreatedByFilterValue): number {
  let count = 0
  if (value.reporterId) count++
  if (value.reporterId && matchCreatedRangePreset(value.createdFrom, value.createdTo)) count++
  return count
}
