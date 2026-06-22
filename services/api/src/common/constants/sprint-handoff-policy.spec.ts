import {
  resolveDefaultSprintHandoffPolicy,
  SprintHandoffPolicy,
  buildSprintHandoffBlockedMessage,
} from './sprint-handoff-policy';

describe('sprint-handoff-policy', () => {
  it('maps done category to ignored', () => {
    expect(resolveDefaultSprintHandoffPolicy('done', 'Done')).toBe(SprintHandoffPolicy.IGNORED);
  });

  it('maps todo category to blocks', () => {
    expect(resolveDefaultSprintHandoffPolicy('todo', 'To Do')).toBe(SprintHandoffPolicy.BLOCKS);
  });

  it('maps in_progress review columns to allows', () => {
    expect(resolveDefaultSprintHandoffPolicy('in_progress', 'In Review')).toBe(
      SprintHandoffPolicy.ALLOWS,
    );
    expect(resolveDefaultSprintHandoffPolicy('in_progress', 'QA')).toBe(SprintHandoffPolicy.ALLOWS);
  });

  it('maps other in_progress columns to blocks', () => {
    expect(resolveDefaultSprintHandoffPolicy('in_progress', 'In Progress')).toBe(
      SprintHandoffPolicy.BLOCKS,
    );
  });
});

describe('buildSprintHandoffBlockedMessage', () => {
  it('formats a single blocker in Option A style', () => {
    expect(
      buildSprintHandoffBlockedMessage('Sprint 5', 'Sprint 4', [{ key: 'ABCTESTING-4', statusName: 'To Do' }], 1),
    ).toBe(
      "Can't start Sprint 5 — Sprint 4 still has ABCTESTING-4 in To Do. Move it to In Progress, Review, QA, or Done first.",
    );
  });
});
