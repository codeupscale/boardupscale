import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * Stricter rate limit for sensitive auth endpoints.
 * Allows 5 requests per 60 seconds (vs the global 100/60s).
 */
export function StrictThrottle() {
  return applyDecorators(
    Throttle({ default: { ttl: 60000, limit: 5 } }),
  );
}
