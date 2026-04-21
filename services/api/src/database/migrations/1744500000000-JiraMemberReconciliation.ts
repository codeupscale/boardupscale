import { MigrationInterface, QueryRunner } from 'typeorm';

export class JiraMemberReconciliation1744500000000 implements MigrationInterface {
  name = 'JiraMemberReconciliation1744500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add jira_account_id to users — needed to track Jira placeholder accounts
    // and enable merge-by-accountId during member reconciliation.
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "jira_account_id" VARCHAR(255) NULL
    `);

    // Existing data may have duplicate jira_account_id (e.g. reconciliation
    // backfilled the same Jira account onto multiple rows). Keep one row per
    // account: prefer real emails over @migrated.jira.local, then lowest id.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "jira_account_id"
            ORDER BY
              CASE WHEN email LIKE '%@migrated.jira.local' THEN 1 ELSE 0 END,
              id
          ) AS rn
        FROM "users"
        WHERE "jira_account_id" IS NOT NULL
      )
      UPDATE "users" u
      SET "jira_account_id" = NULL
      FROM ranked r
      WHERE u.id = r.id AND r.rn > 1
    `);

    // Fast lookup of Jira placeholder users by accountId during merge.
    // Partial unique index: only enforced when jira_account_id is set.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_jira_account_id"
        ON "users" ("jira_account_id")
        WHERE "jira_account_id" IS NOT NULL
    `);

    // NOTE: IDX_project_members_user_id is intentionally omitted here —
    // it is already created in the InitialSchema migration (1741651200000).
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_jira_account_id"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "jira_account_id"
    `);
  }
}
