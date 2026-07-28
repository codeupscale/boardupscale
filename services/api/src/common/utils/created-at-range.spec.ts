import { BadRequestException } from '@nestjs/common';
import { resolveCreatedAtRangeBounds } from './created-at-range';

describe('resolveCreatedAtRangeBounds', () => {
  it('returns empty bounds when no dates provided', () => {
    expect(resolveCreatedAtRangeBounds()).toEqual({});
  });

  it('parses createdFrom as UTC start of day', () => {
    const { createdFromStart, createdToExclusive } = resolveCreatedAtRangeBounds(
      '2024-06-15',
    );
    expect(createdFromStart?.toISOString()).toBe('2024-06-15T00:00:00.000Z');
    expect(createdToExclusive).toBeUndefined();
  });

  it('parses createdTo as exclusive next UTC day', () => {
    const { createdToExclusive } = resolveCreatedAtRangeBounds(undefined, '2024-06-15');
    expect(createdToExclusive?.toISOString()).toBe('2024-06-16T00:00:00.000Z');
  });

  it('accepts equal from and to', () => {
    const bounds = resolveCreatedAtRangeBounds('2024-01-01', '2024-01-01');
    expect(bounds.createdFromStart?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(bounds.createdToExclusive?.toISOString()).toBe('2024-01-02T00:00:00.000Z');
  });

  it('throws when createdFrom is after createdTo', () => {
    expect(() => resolveCreatedAtRangeBounds('2024-06-10', '2024-06-01')).toThrow(
      BadRequestException,
    );
  });

  it('throws on invalid format', () => {
    expect(() => resolveCreatedAtRangeBounds('06/15/2024')).toThrow(BadRequestException);
    expect(() => resolveCreatedAtRangeBounds(undefined, 'not-a-date')).toThrow(
      BadRequestException,
    );
  });

  it('throws on invalid calendar date', () => {
    expect(() => resolveCreatedAtRangeBounds('2024-02-31')).toThrow(BadRequestException);
  });
});
