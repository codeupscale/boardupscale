import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `jira_project_key` (VARCHAR 20, nullable) to the `projects` table.
 *
 * This column is set by the Jira migration worker when a project is first
 * imported from Jira, allowing:
 *  - The migration worker to identify previously-migrated projects on
 *    re-migration and update them (rather than silently skipping or creating
 *    duplicates).
 *  - The UI to distinguish Jira-sourced projects from native Boardupscale
 *    projects.
 *
 * Backfill: any project that already has at least one issue with a jira_key
 * is treated as a Jira-migrated project and its key is copied into this column.
 *
 * The partial index on (organization_id, jira_project_key) WHERE NOT NULL
 * speeds up the worker's per-org lookups.
 */
export class AddProjectJiraKey1745100000000 implements MigrationInterface {
  name = 'AddProjectJiraKey1745100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "jira_project_key" VARCHAR(20) NULL`,
    );

    // Backfill: projects that already hold Jira issues get their key copied
    await queryRunner.query(
      `UPDATE projects p
          SET jira_project_key = p.key
        WHERE jira_project_key IS NULL
          AND EXISTS (
            SELECT 1 FROM issues i
             WHERE i.project_id = p.id
               AND i.jira_key IS NOT NULL
          )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_projects_jira_project_key"
         ON "projects" ("organization_id", "jira_project_key")
         WHERE "jira_project_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_projects_jira_project_key"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "jira_project_key"`);
  }
}
