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
