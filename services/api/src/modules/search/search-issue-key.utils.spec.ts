import { parseIssueKeyQuery } from './search-issue-key.utils';

describe('parseIssueKeyQuery', () => {
  it('parses valid issue keys', () => {
    expect(parseIssueKeyQuery('SCRUM-2')).toEqual({
      prefix: 'SCRUM',
      number: 2,
      formerKey: 'SCRUM-2',
    });
    expect(parseIssueKeyQuery('nice-12')).toEqual({
      prefix: 'NICE',
      number: 12,
      formerKey: 'NICE-12',
    });
  });

  it('returns null for free-text queries', () => {
    expect(parseIssueKeyQuery('ticket title')).toBeNull();
    expect(parseIssueKeyQuery('SCRUM')).toBeNull();
    expect(parseIssueKeyQuery('')).toBeNull();
  });
});
