import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixStoryPointsNumeric1743700000000 implements MigrationInterface {
  name = 'FixStoryPointsNumeric1743700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Jira story points can be decimals (0.5, 1.5, etc.) — INTEGER is too narrow.
    // USING clause safely casts existing integer values to numeric.
    await queryRunner.query(`
      ALTER TABLE "issues"
        ALTER COLUMN "story_points" TYPE NUMERIC(6,1)
        USING "story_points"::numeric(6,1)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Round back to integer on rollback (precision loss is acceptable for rollback)
    await queryRunner.query(`
      ALTER TABLE "issues"
        ALTER COLUMN "story_points" TYPE INTEGER
        USING ROUND("story_points")::integer
    `);
  }
}
