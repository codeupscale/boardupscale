import { hasOrgWideAccess } from '@/common/constants/org-roles';

describe('org-roles', () => {
  describe('hasOrgWideAccess', () => {
    it('returns true for owner', () => {
      expect(hasOrgWideAccess('owner')).toBe(true);
    });

    it('returns true for administrator', () => {
      expect(hasOrgWideAccess('administrator')).toBe(true);
    });

    it('returns false for org user and project roles', () => {
      expect(hasOrgWideAccess('user')).toBe(false);
      expect(hasOrgWideAccess('member')).toBe(false);
      expect(hasOrgWideAccess('admin')).toBe(false);
    });

    it('returns false for nullish', () => {
      expect(hasOrgWideAccess(undefined)).toBe(false);
      expect(hasOrgWideAccess(null)).toBe(false);
    });
  });
});
