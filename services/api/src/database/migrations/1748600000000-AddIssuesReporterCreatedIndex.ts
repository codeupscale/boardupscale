import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Covering index for Created By + createdAt range filters on board / backlog / issues list.
 * Partial (alive rows only) to match IDX_issues_org_project_alive style.
 */
export class AddIssuesReporterCreatedIndex1748600000000 implements MigrationInterface {
  public readonly name = 'AddIssuesReporterCreatedIndex1748600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_org_project_reporter_created_alive"
        ON "issues" ("organization_id", "project_id", "reporter_id", "created_at")
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_issues_org_project_reporter_created_alive"`,
    );
  }
}
