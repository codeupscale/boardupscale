import { BadRequestException } from '@nestjs/common';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type CreatedAtRangeBounds = {
  createdFromStart?: Date;
  createdToExclusive?: Date;
};

/**
 * Parse optional YYYY-MM-DD createdFrom/createdTo into UTC day bounds.
 * Inclusive end date → exclusive upper bound (start of next UTC day).
 */
export function resolveCreatedAtRangeBounds(
  createdFrom?: string,
  createdTo?: string,
): CreatedAtRangeBounds {
  const parseUtcDay = (value: string, label: string): Date => {
    if (!DATE_ONLY.test(value)) {
      throw new BadRequestException(
        `${label} must be a date in YYYY-MM-DD format`,
      );
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${label} is not a valid calendar date`);
    }
    return date;
  };

  let createdFromStart: Date | undefined;
  let createdToExclusive: Date | undefined;
  let createdToStart: Date | undefined;

  if (createdFrom) {
    createdFromStart = parseUtcDay(createdFrom, 'createdFrom');
  }
  if (createdTo) {
    createdToStart = parseUtcDay(createdTo, 'createdTo');
    createdToExclusive = new Date(
      Date.UTC(
        createdToStart.getUTCFullYear(),
        createdToStart.getUTCMonth(),
        createdToStart.getUTCDate() + 1,
      ),
    );
  }

  if (createdFromStart && createdToStart && createdFromStart > createdToStart) {
    throw new BadRequestException('createdFrom must be on or before createdTo');
  }

  return { createdFromStart, createdToExclusive };
}
