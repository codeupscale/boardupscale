import {
  MEMBER_ROLE_BUCKETS,
  MemberRoleBucket,
} from './member-snapshot.constants';
import {
  MemberRoleSegment,
  MemberSnapshot,
} from './dto/org-dashboard-response';

export interface MemberSnapshotScalars {
  totalMembers: number;
  membersAddedThisMonth: number;
  pendingInvites: number;
  /** pendingCreatedThisMonth − invitesAcceptedThisMonth (negative = net decrease). */
  pendingInvitesTrendDelta: number;
  activeInvitations: number;
  nextInviteExpiryAt: Date | string | null;
  roleCounts: Partial<Record<MemberRoleBucket, number>>;
  now?: Date;
}

/**
 * Builds the Member Management Snapshot DTO from aggregated SQL scalars.
 * Pure — unit-testable without DB.
 */
export function buildMemberSnapshot(
  input: MemberSnapshotScalars,
): MemberSnapshot {
  const now = input.now ?? new Date();
  const counts = Object.fromEntries(
    MEMBER_ROLE_BUCKETS.map((k) => [k, 0]),
  ) as Record<MemberRoleBucket, number>;

  for (const key of MEMBER_ROLE_BUCKETS) {
    counts[key] = Math.max(0, Math.floor(input.roleCounts[key] ?? 0));
  }

  const classifiedTotal = MEMBER_ROLE_BUCKETS.reduce(
    (sum, k) => sum + counts[k],
    0,
  );
  const totalMembers = Math.max(0, Math.floor(input.totalMembers));
  // Prefer classified sum when it matches headcount; fall back to KPI total.
  const denom = classifiedTotal > 0 ? classifiedTotal : totalMembers;

  const roleDistribution: MemberRoleSegment[] = MEMBER_ROLE_BUCKETS.map(
    (key) => ({
      key,
      count: counts[key],
      percent: denom > 0 ? Math.round((counts[key] / denom) * 100) : 0,
    }),
  );

  let activeInvitationsHint: string | null = null;
  if (input.activeInvitations > 0 && input.nextInviteExpiryAt) {
    const expiry =
      input.nextInviteExpiryAt instanceof Date
        ? input.nextInviteExpiryAt
        : new Date(input.nextInviteExpiryAt);
    if (!Number.isNaN(expiry.getTime())) {
      const nowUtc = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      const expiryUtc = Date.UTC(
        expiry.getUTCFullYear(),
        expiry.getUTCMonth(),
        expiry.getUTCDate(),
      );
      const days = Math.max(
        0,
        Math.round((expiryUtc - nowUtc) / (24 * 60 * 60 * 1000)),
      );
      activeInvitationsHint =
        days === 0
          ? 'Expires today'
          : days === 1
            ? 'Expires in 1 day'
            : `Expires in ${days} days`;
    }
  }

  return {
    totalMembers,
    membersAddedThisMonth: Math.max(
      0,
      Math.floor(input.membersAddedThisMonth),
    ),
    pendingInvites: Math.max(0, Math.floor(input.pendingInvites)),
    pendingInvitesTrendDelta: Math.trunc(input.pendingInvitesTrendDelta),
    activeInvitations: Math.max(0, Math.floor(input.activeInvitations)),
    activeInvitationsHint,
    roleDistribution,
    countingRule: 'distinct_user_highest_role',
  };
}
