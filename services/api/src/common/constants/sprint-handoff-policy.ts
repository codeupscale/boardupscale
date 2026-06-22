export enum SprintHandoffPolicy {
  BLOCKS = 'blocks',
  ALLOWS = 'allows',
  IGNORED = 'ignored',
}

/** Status display names that default to "allows" handoff when category is in_progress. */
const DEFAULT_ALLOW_HANDOFF_NAMES = new Set([
  'in review',
  'review',
  'review & approval',
  'qa',
]);

export function resolveDefaultSprintHandoffPolicy(
  category: string,
  name?: string | null,
): SprintHandoffPolicy {
  if (category === 'done') {
    return SprintHandoffPolicy.IGNORED;
  }
  if (category === 'todo') {
    return SprintHandoffPolicy.BLOCKS;
  }
  if (category === 'in_progress') {
    const normalized = name?.trim().toLowerCase();
    if (normalized && DEFAULT_ALLOW_HANDOFF_NAMES.has(normalized)) {
      return SprintHandoffPolicy.ALLOWS;
    }
    return SprintHandoffPolicy.BLOCKS;
  }
  return SprintHandoffPolicy.BLOCKS;
}

export function normalizeSprintHandoffPolicyForCategory(
  category: string,
  policy: SprintHandoffPolicy | undefined,
  name?: string | null,
): SprintHandoffPolicy {
  if (category === 'done') {
    return SprintHandoffPolicy.IGNORED;
  }
  if (policy) {
    return policy;
  }
  return resolveDefaultSprintHandoffPolicy(category, name);
}

const HANDOFF_NEXT_STEP =
  'Move it to In Progress, Review, QA, or Done first.';
const HANDOFF_NEXT_STEP_PLURAL =
  'Move them to In Progress, Review, QA, or Done first.';

/** User-facing message when overdue sprint handoff is blocked by unfinished work. */
export function buildSprintHandoffBlockedMessage(
  targetSprintName: string,
  activeSprintName: string,
  blockers: Array<{ key: string; statusName: string }>,
  blockerCount: number,
): string {
  if (blockerCount === 1 && blockers.length >= 1) {
    const blocker = blockers[0];
    return `Can't start ${targetSprintName} — ${activeSprintName} still has ${blocker.key} in ${blocker.statusName}. ${HANDOFF_NEXT_STEP}`;
  }

  if (blockers.length > 0) {
    const listed = blockers.map((b) => `${b.key} in ${b.statusName}`).join(', ');
    const more =
      blockerCount > blockers.length
        ? ` and ${blockerCount - blockers.length} more`
        : '';
    return `Can't start ${targetSprintName} — ${activeSprintName} still has ${listed}${more}. ${HANDOFF_NEXT_STEP_PLURAL}`;
  }

  return `Can't start ${targetSprintName} — ${activeSprintName} still has ${blockerCount} unfinished issue(s). ${HANDOFF_NEXT_STEP_PLURAL}`;
}
