import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `locked_fields` (TEXT[]) to the `issues` table.
 *
 * When a user manually edits a migrated Jira issue in Boardupscale, the
 * updated field name is appended to this array by the issues service.
 * The Jira migration worker reads this array and uses CASE WHEN to skip
 * overwriting manually-edited fields during re-migration.
 *
 * Existing rows receive an empty array `{}` — all fields start unlocked.
 */
export class AddIssueLockedFields1745000000000 implements MigrationInterface {
  name = 'AddIssueLockedFields1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "locked_fields" TEXT[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issues" DROP COLUMN IF EXISTS "locked_fields"`);
  }
}
