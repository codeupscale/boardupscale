import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Covering indexes for Organization Owner dashboard aggregates:
 * - org-scoped activity series + feed
 * - org/project issue rollups (non-deleted)
 * - overdue lookups
 * - member snapshot (org members by created_at for Trends A)
 * - project health keyset listing (org + name + id)
 *
 * Shared across Activity, Projects by Status, Project Health table, and
 * Member Management Snapshot — not org-health-only.
 */
export class AddOrgDashboardIndexes1748400000000 implements MigrationInterface {
  public readonly name = 'AddOrgDashboardIndexes1748400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_activities_org_created_at"
        ON "activities" ("organization_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_org_project_alive"
        ON "issues" ("organization_id", "project_id")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_org_due_date_alive"
        ON "issues" ("organization_id", "due_date")
        WHERE "deleted_at" IS NULL
          AND "due_date" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issue_links_link_type"
        ON "issue_links" ("link_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_organization_members_org_created_at"
        ON "organization_members" ("organization_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projects_org_name_id"
        ON "projects" ("organization_id", "name", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_org_name_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_organization_members_org_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issue_links_link_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issues_org_due_date_alive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issues_org_project_alive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_activities_org_created_at"`);
  }
}
