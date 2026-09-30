import { htmlToText, plainTextToCommentHtml, summarizePullRequests } from './mcp-format.util';

describe('mcp-format.util', () => {
  describe('htmlToText', () => {
    it('strips tags and decodes entities', () => {
      expect(htmlToText('<p>Hello <b>world</b> &amp; co</p><ul><li>one</li></ul>')).toBe(
        'Hello world & co\n- one',
      );
    });

    it('returns null for empty input and truncates long text', () => {
      expect(htmlToText(null)).toBeNull();
      expect(htmlToText('abcdef', 3)).toBe('abc… [truncated]');
    });
  });

  describe('plainTextToCommentHtml', () => {
    it('escapes markup so AI clients cannot inject HTML', () => {
      expect(plainTextToCommentHtml('<img src=x onerror=alert(1)>')).toBe(
        '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
      );
    });

    it('turns blank lines into paragraphs and newlines into <br>', () => {
      expect(plainTextToCommentHtml('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
    });
  });

  describe('summarizePullRequests', () => {
    it('collapses events to the newest state per PR and ignores commits', () => {
      const newer = new Date('2026-01-02');
      const older = new Date('2026-01-01');
      const prs = summarizePullRequests([
        { eventType: 'pr_merged', prNumber: 7, prTitle: 'Fix', prUrl: 'u', branchName: null, author: 'a', createdAt: newer, issue: { key: 'P-1' } },
        { eventType: 'commit', prNumber: null, prTitle: null, prUrl: null, branchName: 'b', author: 'a', createdAt: newer },
        { eventType: 'pr_opened', prNumber: 7, prTitle: 'Fix', prUrl: 'u', branchName: 'feat/P-1', author: 'a', createdAt: older, issue: { key: 'P-2' } },
      ]);
      expect(prs).toEqual([
        expect.objectContaining({ number: 7, state: 'merged', branch: 'feat/P-1', issueKeys: ['P-1', 'P-2'] }),
      ]);
    });
  });
});
