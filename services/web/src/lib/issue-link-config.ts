import { IssueLinkType } from '@/types'

export interface IssueLinkTypeOption {
  value: IssueLinkType
  labelKey: string
  fallbackLabel: string
}

/** Single source of truth for issue link type pickers (detail page, create modal, etc.) */
export const ISSUE_LINK_TYPE_OPTIONS: IssueLinkTypeOption[] = [
  { value: 'relates_to', labelKey: 'issues.linkRelatesTo', fallbackLabel: 'Relates to' },
  { value: 'blocks', labelKey: 'issues.linkBlocks', fallbackLabel: 'Blocks' },
  { value: 'is_blocked_by', labelKey: 'issues.linkBlockedBy', fallbackLabel: 'Is blocked by' },
  { value: 'duplicates', labelKey: 'issues.linkDuplicates', fallbackLabel: 'Duplicates' },
  { value: 'is_duplicated_by', labelKey: 'issues.linkDuplicatedBy', fallbackLabel: 'Is duplicated by' },
]

export const ISSUE_LINK_TYPE_FALLBACK_LABELS: Record<IssueLinkType, string> =
  ISSUE_LINK_TYPE_OPTIONS.reduce(
    (acc, option) => {
      acc[option.value] = option.fallbackLabel
      return acc
    },
    {} as Record<IssueLinkType, string>,
  )

export function getIssueLinkTypeLabel(
  linkType: IssueLinkType,
  translate?: (key: string, fallback: string) => string,
): string {
  const option = ISSUE_LINK_TYPE_OPTIONS.find((o) => o.value === linkType)
  if (!option) return linkType
  return translate
    ? translate(option.labelKey, option.fallbackLabel)
    : option.fallbackLabel
}
