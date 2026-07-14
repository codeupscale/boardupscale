/** Tailwind classes for deterministic label pill colors (hash-based) */
export const ISSUE_LABEL_PILL_COLORS = [
  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'bg-sky-500/15 text-sky-400 border-sky-500/30',
  'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'bg-rose-500/15 text-rose-400 border-rose-500/30',
  'bg-orange-500/15 text-orange-400 border-orange-500/30',
] as const

function hashStringForColorIndex(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getIssueLabelColorClass(label: string): string {
  return ISSUE_LABEL_PILL_COLORS[
    hashStringForColorIndex(label) % ISSUE_LABEL_PILL_COLORS.length
  ]
}
