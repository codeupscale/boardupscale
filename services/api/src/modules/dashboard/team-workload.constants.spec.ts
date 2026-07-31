import {
  WORKLOAD_AVAILABLE_MAX,
  WORKLOAD_NEAR_CAPACITY_MAX,
  classifyWorkloadCapacity,
} from './team-workload.constants';

describe('classifyWorkloadCapacity', () => {
  it('classifies 0 assigned issues as available', () => {
    expect(classifyWorkloadCapacity(0)).toBe('available');
  });

  it('classifies at the available ceiling as available', () => {
    expect(classifyWorkloadCapacity(WORKLOAD_AVAILABLE_MAX)).toBe(
      'available',
    );
  });

  it('classifies just above the available ceiling as near_capacity', () => {
    expect(classifyWorkloadCapacity(WORKLOAD_AVAILABLE_MAX + 1)).toBe(
      'near_capacity',
    );
  });

  it('classifies at the near-capacity ceiling as near_capacity', () => {
    expect(classifyWorkloadCapacity(WORKLOAD_NEAR_CAPACITY_MAX)).toBe(
      'near_capacity',
    );
  });

  it('classifies above the near-capacity ceiling as overloaded', () => {
    expect(classifyWorkloadCapacity(WORKLOAD_NEAR_CAPACITY_MAX + 1)).toBe(
      'overloaded',
    );
  });

  it('treats negative/garbage input as 0 (available)', () => {
    expect(classifyWorkloadCapacity(-5)).toBe('available');
    expect(classifyWorkloadCapacity(NaN)).toBe('available');
  });
});
