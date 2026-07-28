import { format, subDays } from 'date-fns'

export type CreatedRangePreset = 'today' | 'last7' | 'last30' | 'last90'

export const CREATED_RANGE_PRESET_OPTIONS: Array<{
  value: CreatedRangePreset
  label: string
}> = [
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
]

export type CreatedAtRange = {
  createdFrom?: string
  createdTo?: string
}

/** Map a preset to inclusive YYYY-MM-DD bounds (local calendar days). */
export function resolveCreatedRangePreset(
  preset: CreatedRangePreset,
  now = new Date(),
): { createdFrom: string; createdTo: string } {
  const createdTo = format(now, 'yyyy-MM-dd')
  switch (preset) {
    case 'today':
      return { createdFrom: createdTo, createdTo }
    case 'last7':
      return { createdFrom: format(subDays(now, 6), 'yyyy-MM-dd'), createdTo }
    case 'last30':
      return { createdFrom: format(subDays(now, 29), 'yyyy-MM-dd'), createdTo }
    case 'last90':
      return { createdFrom: format(subDays(now, 89), 'yyyy-MM-dd'), createdTo }
  }
}

/** Returns the matching preset, or undefined when dates are empty / not a preset. */
export function matchCreatedRangePreset(
  createdFrom?: string,
  createdTo?: string,
  now = new Date(),
): CreatedRangePreset | undefined {
  if (!createdFrom || !createdTo) return undefined
  for (const preset of CREATED_RANGE_PRESET_OPTIONS.map((o) => o.value)) {
    const range = resolveCreatedRangePreset(preset, now)
    if (range.createdFrom === createdFrom && range.createdTo === createdTo) {
      return preset
    }
  }
  return undefined
}

/** Clear date bounds whenever Created By is cleared. */
export function withReporterFilterChange(
  reporterId: string | undefined,
  current: CreatedAtRange,
): { reporterId?: string } & CreatedAtRange {
  if (!reporterId) {
    return { reporterId: undefined, createdFrom: undefined, createdTo: undefined }
  }
  return {
    reporterId,
    createdFrom: current.createdFrom,
    createdTo: current.createdTo,
  }
}
