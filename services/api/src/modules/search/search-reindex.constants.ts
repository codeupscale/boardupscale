/** Phases for resumable project search reindex jobs. */
export const SEARCH_REINDEX_PHASE_PROJECT = 1;
export const SEARCH_REINDEX_PHASE_ISSUES = 2;
export const SEARCH_REINDEX_PHASE_MEMBERS = 3;

export const SEARCH_REINDEX_ISSUE_BATCH_SIZE = 200;

/** Pending > 2 min without worker start. */
export const SEARCH_REINDEX_STALLED_PENDING_MS = 2 * 60 * 1000;

/** Processing > 30 min without DB progress update. */
export const SEARCH_REINDEX_STALLED_PROCESSING_MS = 30 * 60 * 1000;

export function searchReindexBullJobId(jobId: string): string {
  return `search-reindex-${jobId}`;
}
