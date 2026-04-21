import { MigrationInterface, QueryRunner } from 'typeorm';

export class JiraMemberReconciliation1744500000000 implements MigrationInterface {
  name = 'JiraMemberReconciliation1744500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fast lookup of Jira placeholder users by accountId during merge
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_jira_account_id"
        ON "users" ("jira_account_id")
        WHERE "jira_account_id" IS NOT NULL
    `);

    // Speeds up repair query: find all projects a user belongs to
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_members_user_id"
        ON "project_members" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_members_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_jira_account_id"`);
  }
}
