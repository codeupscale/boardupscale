import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `jira_sprint_id` (Jira's numeric sprint ID) to the `sprints` table and
 * a partial unique index on (project_id, jira_sprint_id) so the migration
 * worker can do ON CONFLICT … DO UPDATE rather than the brittle
 * "WHERE NOT EXISTS by name" pattern.
 *
 * The index is partial (WHERE jira_sprint_id IS NOT NULL) so native
 * Boardupscale sprints (NULL jira_sprint_id) are unaffected.
 *
 * Existing rows receive NULL for jira_sprint_id; the migration worker will
 * backfill them by name on the next re-import run.
 */
export class AddJiraSprintId1744900000000 implements MigrationInterface {
  name = 'AddJiraSprintId1744900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sprints"
        ADD COLUMN IF NOT EXISTS "jira_sprint_id" INTEGER NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_sprints_project_jira_sprint_id"
        ON "sprints" ("project_id", "jira_sprint_id")
        WHERE "jira_sprint_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_sprints_project_jira_sprint_id"`);
    await queryRunner.query(`ALTER TABLE "sprints" DROP COLUMN IF EXISTS "jira_sprint_id"`);
  }
}
