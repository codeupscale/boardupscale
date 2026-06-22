import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds per-column sprint handoff policy for overdue sprint transitions.
 * Values: blocks | allows | ignored (done columns).
 */
export class AddSprintHandoffPolicy1747900000000 implements MigrationInterface {
  public readonly name = 'AddSprintHandoffPolicy1747900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "issue_statuses"
        ADD COLUMN IF NOT EXISTS "sprint_handoff_policy" character varying(20) NOT NULL DEFAULT 'blocks';
    `);

    await queryRunner.query(`
      UPDATE "issue_statuses"
      SET "sprint_handoff_policy" = 'ignored'
      WHERE "category" = 'done';
    `);

    await queryRunner.query(`
      UPDATE "issue_statuses"
      SET "sprint_handoff_policy" = 'blocks'
      WHERE "category" = 'todo';
    `);

    await queryRunner.query(`
      UPDATE "issue_statuses"
      SET "sprint_handoff_policy" = 'allows'
      WHERE "category" = 'in_progress'
        AND lower(trim("name")) IN ('in review', 'review', 'review & approval', 'qa');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "issue_statuses"
        DROP COLUMN IF EXISTS "sprint_handoff_policy";
    `);
  }
}
