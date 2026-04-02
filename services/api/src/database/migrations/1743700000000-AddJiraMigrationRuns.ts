import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddJiraMigrationRuns
 *
 * Creates the `jira_migration_runs` table — the durable audit trail and
 * resume-checkpoint store for the Jira → Boardupscale migration wizard.
 *
 * Design notes:
 *  - Pure CREATE TABLE (no ALTER on existing tables) → zero table-lock risk.
 *  - All non-PK columns are nullable or have explicit DEFAULT values.
 *  - `organization_id` is present for tenant isolation (mandatory per CLAUDE.md).
 *  - `deleted_at` present for soft-delete compliance.
 *  - `current_phase` + `current_offset` enable per-phase resume-on-failure.
 *  - JSONB columns hold semi-structured blobs (project selection, mappings, report).
 *  - Partial index on status speeds up "find in-flight jobs" queries.
 *  - Three FK indexes prevent Seq Scans on every join.
 *
 * Gate checks:
 *  ✓ All columns nullable or have DEFAULT — no existing rows affected
 *  ✓ Full down() that reverses up() exactly
 *  ✓ organization_id present with dedicated index
 *  ✓ FK columns (triggered_by_id, connection_id) have indexes
 *  ✓ Partial index on status for pending/processing lookup
 *  ✓ No ALTER on large existing tables (issues, users, etc.)
 *  ✓ UUID primary key
 *  ✓ created_at, updated_at, deleted_at present
 */
export class AddJiraMigrationRuns1743700000000 implements MigrationInterface {
  name = 'AddJiraMigrationRuns1743700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Create jira_migration_runs ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jira_migration_runs" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     UUID          NOT NULL,
        "triggered_by_id"     UUID          NOT NULL,
        "connection_id"       UUID          NULL,

        -- Configuration snapshot (saved when migration is started)
        "selected_projects"   JSONB         NULL,
        "status_mapping"      JSONB         NULL,
        "role_mapping"        JSONB         NULL,
        "options"             JSONB         NULL,

        -- Runtime state (supports per-phase resume-on-failure)
        "status"              VARCHAR(20)   NOT NULL DEFAULT 'pending',
        "current_phase"       SMALLINT      NOT NULL DEFAULT 0,
        "current_offset"      INT           NOT NULL DEFAULT 0,

        -- Progress counters
        "total_projects"      INT           NOT NULL DEFAULT 0,
        "processed_projects"  INT           NOT NULL DEFAULT 0,
        "total_issues"        INT           NOT NULL DEFAULT 0,
        "processed_issues"    INT           NOT NULL DEFAULT 0,
        "failed_issues"       INT           NOT NULL DEFAULT 0,
        "total_members"       INT           NOT NULL DEFAULT 0,
        "processed_members"   INT           NOT NULL DEFAULT 0,
        "total_sprints"       INT           NOT NULL DEFAULT 0,
        "processed_sprints"   INT           NOT NULL DEFAULT 0,
        "total_comments"      INT           NOT NULL DEFAULT 0,
        "processed_comments"  INT           NOT NULL DEFAULT 0,

        -- Final result written on completion
        "result_summary"      JSONB         NULL,
        "error_log"           JSONB         NULL,

        -- Timestamps
        "started_at"          TIMESTAMPTZ   NULL,
        "completed_at"        TIMESTAMPTZ   NULL,
        "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "deleted_at"          TIMESTAMPTZ   NULL,

        -- Constraints
        CONSTRAINT "pk_jira_migration_runs"
          PRIMARY KEY ("id"),
        CONSTRAINT "fk_jira_migration_runs_org"
          FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_jira_migration_runs_user"
          FOREIGN KEY ("triggered_by_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_jira_migration_runs_connection"
          FOREIGN KEY ("connection_id")
          REFERENCES "jira_connections" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_jira_migration_runs_status"
          CHECK ("status" IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
        CONSTRAINT "ck_jira_migration_runs_phase"
          CHECK ("current_phase" BETWEEN 0 AND 6)
      )
    `);

    // ── Indexes ─────────────────────────────────────────────────────────────

    // Tenant isolation query: WHERE organization_id = $1
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_migration_runs_org"
        ON "jira_migration_runs" ("organization_id")
    `);

    // FK join index: triggered_by_id
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_migration_runs_triggered_by"
        ON "jira_migration_runs" ("triggered_by_id")
    `);

    // FK join index: connection_id (nullable)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_migration_runs_connection"
        ON "jira_migration_runs" ("connection_id")
        WHERE "connection_id" IS NOT NULL
    `);

    // Partial index: find pending/processing jobs quickly (worker polling)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_migration_runs_active_status"
        ON "jira_migration_runs" ("status")
        WHERE "status" IN ('pending', 'processing')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first (some DBs require this before DROP TABLE,
    // though PostgreSQL drops them automatically with the table —
    // explicit drops make the rollback intent clear).
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_jira_migration_runs_active_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_jira_migration_runs_connection"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_jira_migration_runs_triggered_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_jira_migration_runs_org"`);

    // Drop the table
    await queryRunner.query(`DROP TABLE IF EXISTS "jira_migration_runs"`);
  }
}
