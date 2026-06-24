import type { QueryClient } from '@tanstack/react-query'

/** Refresh project list aggregates (member/issue counts) after membership or issue changes. */
export function invalidateProjectList(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['projects'] })
}
