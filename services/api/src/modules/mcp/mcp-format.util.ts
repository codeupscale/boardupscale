const MAX_TEXT = 4000;

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  amp: '&',
};

/** Remove tags until none remain, so nested fragments like `<scr<b>ipt>` can't survive. */
function stripTags(value: string): string {
  let previous: string;
  let current = value;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  } while (current !== previous);
  return current;
}

/**
 * Convert stored rich-text HTML into compact plain text for LLM consumption.
 * Tags are stripped before entities are decoded (in a single pass), so text
 * the user wrote as `&lt;div&gt;` survives as `<div>` instead of being removed.
 * The result is plain text and must never be rendered as HTML.
 */
export function htmlToText(html: string | null | undefined, max = MAX_TEXT): string | null {
  if (!html) return null;
  const withBreaks = html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ');
  const text = stripTags(withBreaks)
    .replace(/&(nbsp|lt|gt|quot|#39|amp);/g, (_, name: string) => ENTITIES[name])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max)}… [truncated]` : text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Turn plain/markdown text from an AI client into safe comment HTML.
 * Everything is escaped — no caller-supplied markup reaches the stored HTML.
 */
export function plainTextToCommentHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export interface PullRequestSummary {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'merged' | 'closed';
  branch: string | null;
  author: string | null;
  issueKeys: string[];
  updatedAt: Date;
}

interface GitHubEventLike {
  eventType: string;
  prNumber: number | null;
  prTitle: string | null;
  prUrl: string | null;
  branchName: string | null;
  author: string | null;
  createdAt: Date;
  issue?: { key?: string } | null;
  metadata?: Record<string, any>;
}

/**
 * Collapse the PR event log into one entry per PR, using the newest event as
 * the current state. Expects events sorted newest first.
 */
export function summarizePullRequests(events: GitHubEventLike[]): PullRequestSummary[] {
  const byNumber = new Map<number, PullRequestSummary>();
  for (const e of events) {
    if (!e.prNumber || !e.eventType.startsWith('pr_')) continue;
    const issueKey = e.issue?.key ?? e.metadata?.issueKey;
    const existing = byNumber.get(e.prNumber);
    if (existing) {
      if (issueKey && !existing.issueKeys.includes(issueKey)) existing.issueKeys.push(issueKey);
      existing.branch = existing.branch ?? e.branchName;
      continue;
    }
    byNumber.set(e.prNumber, {
      number: e.prNumber,
      title: e.prTitle ?? '',
      url: e.prUrl ?? '',
      state:
        e.eventType === 'pr_merged' ? 'merged' : e.eventType === 'pr_closed' ? 'closed' : 'open',
      branch: e.branchName,
      author: e.author,
      issueKeys: issueKey ? [issueKey] : [],
      updatedAt: e.createdAt,
    });
  }
  return [...byNumber.values()];
}
