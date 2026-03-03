import IORedis from 'ioredis';
import { config } from './config';

let retryAttempt = 0;

export function createRedisConnection(): IORedis {
  const connection = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Required by BullMQ
    retryStrategy(times: number) {
      retryAttempt = times;
      if (times > 20) {
        console.error('[Redis] Max reconnection attempts reached. Giving up.');
        return null; // Stop retrying
      }
      // Exponential backoff: 100ms, 200ms, 400ms ... capped at 30s
      const delay = Math.min(100 * Math.pow(2, times - 1), 30000);
      console.warn(`[Redis] Reconnecting attempt ${times}, waiting ${delay}ms...`);
      return delay;
    },
  });

  connection.on('connect', () => {
    retryAttempt = 0;
    console.log('[Redis] Connected successfully');
  });

  connection.on('ready', () => {
    console.log('[Redis] Connection is ready');
  });

  connection.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
  });

  connection.on('close', () => {
    console.warn('[Redis] Connection closed');
  });

  connection.on('reconnecting', () => {
    console.warn(`[Redis] Reconnecting... (attempt ${retryAttempt})`);
  });

  connection.on('end', () => {
    console.error('[Redis] Connection ended. No more retries.');
  });

  return connection;
}

// Shared connection instance used for workers (BullMQ workers need their own connection)
export const redisConnection = createRedisConnection();
