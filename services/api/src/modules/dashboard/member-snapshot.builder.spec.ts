import { buildMemberSnapshot } from './member-snapshot.builder';

describe('buildMemberSnapshot', () => {
  const fixedNow = new Date('2026-07-23T12:00:00.000Z');

  it('counts each person once via roleDistribution percents that sum near 100', () => {
    const snap = buildMemberSnapshot({
      totalMembers: 10,
      membersAddedThisMonth: 2,
      pendingInvites: 3,
      pendingInvitesTrendDelta: -1,
      activeInvitations: 2,
      nextInviteExpiryAt: '2026-07-26T12:00:00.000Z',
      roleCounts: {
        org_owner: 1,
        org_administrator: 2,
        project_admin: 2,
        project_member: 3,
        project_viewer: 1,
        org_user: 1,
      },
      now: fixedNow,
    });

    expect(snap.roleDistribution.map((s) => s.key)).toEqual([
      'org_owner',
      'org_administrator',
      'project_admin',
      'project_member',
      'project_viewer',
      'org_user',
    ]);
    expect(snap.roleDistribution.reduce((n, s) => n + s.count, 0)).toBe(10);
    expect(snap.countingRule).toBe('distinct_user_highest_role');
    expect(snap.activeInvitationsHint).toBe('Expires in 3 days');
    expect(snap.membersAddedThisMonth).toBe(2);
    expect(snap.pendingInvitesTrendDelta).toBe(-1);
  });

  it('returns empty-safe zeros when org has no members', () => {
    const snap = buildMemberSnapshot({
      totalMembers: 0,
      membersAddedThisMonth: 0,
      pendingInvites: 0,
      pendingInvitesTrendDelta: 0,
      activeInvitations: 0,
      nextInviteExpiryAt: null,
      roleCounts: {},
      now: fixedNow,
    });

    expect(snap.totalMembers).toBe(0);
    expect(snap.activeInvitationsHint).toBeNull();
    expect(snap.roleDistribution.every((s) => s.count === 0 && s.percent === 0)).toBe(
      true,
    );
  });

  it('formats expiry hint for today and one day', () => {
    expect(
      buildMemberSnapshot({
        totalMembers: 1,
        membersAddedThisMonth: 0,
        pendingInvites: 1,
        pendingInvitesTrendDelta: 0,
        activeInvitations: 1,
        nextInviteExpiryAt: '2026-07-23T18:00:00.000Z',
        roleCounts: { org_owner: 1 },
        now: fixedNow,
      }).activeInvitationsHint,
    ).toBe('Expires today');

    expect(
      buildMemberSnapshot({
        totalMembers: 1,
        membersAddedThisMonth: 0,
        pendingInvites: 1,
        pendingInvitesTrendDelta: 0,
        activeInvitations: 1,
        nextInviteExpiryAt: '2026-07-24T12:00:00.000Z',
        roleCounts: { org_owner: 1 },
        now: fixedNow,
      }).activeInvitationsHint,
    ).toBe('Expires in 1 day');
  });
});
