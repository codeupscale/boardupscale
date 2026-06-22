import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendProjectPortabilityV111748000000000 implements MigrationInterface {
  name = 'ExtendProjectPortabilityV111748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attachments
      ADD COLUMN IF NOT EXISTS portability_source_id uuid NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_portability_source
      ON attachments (issue_id, portability_source_id)
      WHERE portability_source_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS portability_source_id uuid NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_portability_source
      ON comments (issue_id, portability_source_id)
      WHERE portability_source_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE work_logs
      ADD COLUMN IF NOT EXISTS portability_source_id uuid NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_work_logs_portability_source
      ON work_logs (issue_id, portability_source_id)
      WHERE portability_source_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE project_portability_jobs
      ADD COLUMN IF NOT EXISTS total_attachments int NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE project_portability_jobs
      ADD COLUMN IF NOT EXISTS processed_attachments int NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE project_portability_jobs
      ADD COLUMN IF NOT EXISTS attachment_offset int NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_portability_jobs DROP COLUMN IF EXISTS attachment_offset
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_work_logs_portability_source`);
    await queryRunner.query(`
      ALTER TABLE work_logs DROP COLUMN IF EXISTS portability_source_id
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comments_portability_source`);
    await queryRunner.query(`
      ALTER TABLE comments DROP COLUMN IF EXISTS portability_source_id
    `);
    await queryRunner.query(`
      ALTER TABLE project_portability_jobs DROP COLUMN IF EXISTS processed_attachments
    `);
    await queryRunner.query(`
      ALTER TABLE project_portability_jobs DROP COLUMN IF EXISTS total_attachments
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attachments_portability_source`);
    await queryRunner.query(`
      ALTER TABLE attachments DROP COLUMN IF EXISTS portability_source_id
    `);
  }
}
