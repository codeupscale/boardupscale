import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddOAuthRefreshToken
 *
 * Adds OAuth refresh token storage to `jira_connections` so that long-running
 * migrations (> 1 hour) can silently refresh the Atlassian access token before
 * it expires rather than failing mid-run.
 *
 * Columns added:
 *   refresh_token_enc  TEXT  NULLABLE
 *     AES-256-GCM encrypted Atlassian refresh_token.
 *     NULL for API-token connections (they don't expire).
 *
 *   token_expires_at   TIMESTAMPTZ  NULLABLE
 *     When the current access token expires.
 *     NULL for API-token connections.
 *     Set to NOW() + 3600s on initial OAuth exchange and updated on each refresh.
 *
 * Gate checks:
 *   ✓ Both columns nullable — zero risk to existing rows
 *   ✓ Full down() that reverses up() exactly
 *   ✓ No NOT NULL without DEFAULT on existing table
 *   ✓ Minimal ALTER — no index on nullable text column needed
 */
export class AddOAuthRefreshToken1743800000000 implements MigrationInterface {
  name = 'AddOAuthRefreshToken1743800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jira_connections
        ADD COLUMN IF NOT EXISTS refresh_token_enc  TEXT             NULL,
        ADD COLUMN IF NOT EXISTS token_expires_at   TIMESTAMPTZ      NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE jira_connections
        DROP COLUMN IF EXISTS token_expires_at,
        DROP COLUMN IF EXISTS refresh_token_enc
    `);
  }
}
