import { parseAggregateCount, toProjectListItem } from './project-list.types';
import { mockProject } from '../../test/mock-factories';

describe('project-list.types', () => {
  describe('parseAggregateCount', () => {
    it('parses numeric strings', () => {
      expect(parseAggregateCount('12')).toBe(12);
    });

    it('returns 0 for nullish and invalid values', () => {
      expect(parseAggregateCount(null)).toBe(0);
      expect(parseAggregateCount(undefined)).toBe(0);
      expect(parseAggregateCount('not-a-number')).toBe(0);
    });

    it('clamps negative values to 0', () => {
      expect(parseAggregateCount(-3)).toBe(0);
    });
  });

  describe('toProjectListItem', () => {
    it('maps aggregate fields onto the project entity', () => {
      const project = mockProject();
      const item = toProjectListItem(project, { memberCount: '4', issueCount: '17' });

      expect(item.id).toBe(project.id);
      expect(item.memberCount).toBe(4);
      expect(item.issueCount).toBe(17);
    });
  });
});
