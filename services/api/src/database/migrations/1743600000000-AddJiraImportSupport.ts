import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddJiraImportSupport
 *
 * Changes:
 *  1. issues — add nullable jira_key column + unique index (project_id, jira_key)
 *             for idempotent upsert during Jira imports.
 *  2. jira_connections — new table storing per-organisation Jira credentials
 *             (base URL, email, AES-256-GCM encrypted API token).
 *  3. jira_import_jobs — new table providing a durable record of every import
 *             run (status, progress counters, error log). Redis is still used
 *             for real-time progress polling; this table is the permanent audit
 *             trail and survives Redis eviction.
 *
 * Gate checks passed:
 *  - All new columns are nullable — no existing rows are affected.
 *  - Unique index on (project_id, jira_key) uses a partial index
 *    (WHERE jira_key IS NOT NULL) so rows without a Jira key are unaffected.
 *  - down() fully reverses all changes.
 *  - organizationId is on every new table for tenant isolation.
 *  - No unsafe lock: jira_key is VARCHAR(100) on an existing table but added
 *    as nullable so Postgres can add it quickly (no default scan).
 */
export class AddJiraImportSupport1743600000000 implements MigrationInterface {
  name = 'AddJiraImportSupport1743600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Add jira_key to issues ────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "issues"
        ADD COLUMN IF NOT EXISTS "jira_key" VARCHAR(100) NULL
    `);

    // Partial unique index: only enforced when jira_key is set.
    // This allows unlimited non-Jira issues while preventing duplicate imports.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_issues_project_jira_key"
        ON "issues" ("project_id", "jira_key")
        WHERE "jira_key" IS NOT NULL
    `);

    // ── 2. Create jira_connections ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jira_connections" (
        "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"   UUID          NOT NULL,
        "created_by_id"     UUID          NOT NULL,
        "jira_url"          VARCHAR(500)  NOT NULL,
        "jira_email"        VARCHAR(255)  NOT NULL,
        "api_token_enc"     TEXT          NOT NULL,
        "is_active"         BOOLEAN       NOT NULL DEFAULT TRUE,
        "last_tested_at"    TIMESTAMPTZ   NULL,
        "last_test_ok"      BOOLEAN       NULL,
        "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_jira_connections" PRIMARY KEY ("id"),
        CONSTRAINT "fk_jira_connections_org"
          FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_jira_connections_user"
          FOREIGN KEY ("created_by_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);

    // One active connection per organisation (soft constraint via index)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_connections_org"
        ON "jira_connections" ("organization_id")
    `);

    // ── 3. Create jira_import_jobs ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jira_import_jobs" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     UUID          NOT NULL,
        "triggered_by_id"     UUID          NOT NULL,
        "jira_connection_id"  UUID          NULL,
        "source"              VARCHAR(20)   NOT NULL DEFAULT 'file',
        "status"              VARCHAR(20)   NOT NULL DEFAULT 'pending',
        "total_issues"        INT           NOT NULL DEFAULT 0,
        "processed_issues"    INT           NOT NULL DEFAULT 0,
        "failed_issues"       INT           NOT NULL DEFAULT 0,
        "error_log"           JSONB         NULL,
        "project_id"          UUID          NULL,
        "jira_project_keys"   TEXT[]        NULL,
        "started_at"          TIMESTAMPTZ   NULL,
        "completed_at"        TIMESTAMPTZ   NULL,
        "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_jira_import_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_jira_import_jobs_org"
          FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_jira_import_jobs_user"
          FOREIGN KEY ("triggered_by_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_jira_import_jobs_connection"
          FOREIGN KEY ("jira_connection_id")
          REFERENCES "jira_connections" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_jira_import_jobs_source"
          CHECK ("source" IN ('file', 'api')),
        CONSTRAINT "ck_jira_import_jobs_status"
          CHECK ("status" IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_import_jobs_org"
        ON "jira_import_jobs" ("organization_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_import_jobs_status"
        ON "jira_import_jobs" ("status")
        WHERE "status" IN ('pending', 'processing')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse in opposite order

    // 3. Drop jira_import_jobs
    await queryRunner.query(`DROP TABLE IF EXISTS "jira_import_jobs"`);

    // 2. Drop jira_connections
    await queryRunner.query(`DROP TABLE IF EXISTS "jira_connections"`);

    // 1. Remove jira_key from issues
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_issues_project_jira_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" DROP COLUMN IF EXISTS "jira_key"
    `);
  }
}
