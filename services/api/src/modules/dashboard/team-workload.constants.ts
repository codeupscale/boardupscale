/** Capacity thresholds for the Team Workload widget, based on active (not-done) issue count. */
export const WORKLOAD_AVAILABLE_MAX = 4;
export const WORKLOAD_NEAR_CAPACITY_MAX = 10;

export type WorkloadCapacity = 'available' | 'near_capacity' | 'overloaded';

export function classifyWorkloadCapacity(
  activeCount: number,
): WorkloadCapacity {
  const count = Math.max(0, Number(activeCount) || 0);
  if (count <= WORKLOAD_AVAILABLE_MAX) return 'available';
  if (count <= WORKLOAD_NEAR_CAPACITY_MAX) return 'near_capacity';
  return 'overloaded';
}

export const TEAM_WORKLOAD_TOP_BUSIEST_LIMIT = 5;
export const MEMBER_ACTIVE_SPRINTS_LIMIT = 5;
