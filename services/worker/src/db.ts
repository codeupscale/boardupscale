import { Pool, PoolClient } from 'pg';
import { config } from './config';

export const db = new Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('connect', (client: PoolClient) => {
  console.log('[DB] New client connected to PostgreSQL');
});

db.on('acquire', (client: PoolClient) => {
  // Client acquired from pool — useful for debugging pool exhaustion
});

db.on('remove', (client: PoolClient) => {
  console.log('[DB] Client removed from pool');
});

db.on('error', (err: Error, client: PoolClient) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

export async function connectDb(): Promise<void> {
  const client = await db.connect();
  console.log('[DB] PostgreSQL pool connected successfully');
  client.release();
}
