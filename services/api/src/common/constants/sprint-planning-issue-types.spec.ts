import {
  isSprintEligibleIssueType,
  normalizeSprintIdForIssueType,
} from './sprint-planning-issue-types';

describe('sprint-planning-issue-types', () => {
  it('treats story, task, and bug as sprint-eligible', () => {
    expect(isSprintEligibleIssueType('story')).toBe(true);
    expect(isSprintEligibleIssueType('task')).toBe(true);
    expect(isSprintEligibleIssueType('bug')).toBe(true);
  });

  it('treats epic and subtask as sprint-ineligible', () => {
    expect(isSprintEligibleIssueType('epic')).toBe(false);
    expect(isSprintEligibleIssueType('subtask')).toBe(false);
  });

  it('strips sprint id for ineligible types', () => {
    expect(normalizeSprintIdForIssueType('epic', 'sprint-1')).toBeNull();
    expect(normalizeSprintIdForIssueType('story', 'sprint-1')).toBe('sprint-1');
  });
});
