import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttachmentStaging1744400000000 implements MigrationInterface {
  name = 'AddAttachmentStaging1744400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Staging table for Jira attachment metadata captured in Phase 4
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jira_migration_attachment_staging" (
        "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
        "migration_run_id"    VARCHAR(36)  NOT NULL,
        "jira_attachment_id"  VARCHAR(100) NOT NULL,
        "jira_issue_key"      VARCHAR(50)  NOT NULL,
        "local_issue_id"      UUID         NOT NULL
          REFERENCES "issues"("id") ON DELETE CASCADE,
        "download_url"        TEXT         NOT NULL,
        "file_name"           VARCHAR(500) NOT NULL,
        "mime_type"           VARCHAR(255) NOT NULL,
        "file_size"           BIGINT       NOT NULL,
        "attempt_count"       SMALLINT     NOT NULL DEFAULT 0,
        "downloaded_at"       TIMESTAMPTZ,
        "error"               TEXT,
        CONSTRAINT "pk_jira_attachment_staging"
          PRIMARY KEY ("id"),
        CONSTRAINT "uq_jira_attachment_staging_run_att"
          UNIQUE ("migration_run_id", "jira_attachment_id")
      )
    `);

    // Partial index for Phase 6's batch SELECT — only pending rows
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_attachment_staging_pending"
        ON "jira_migration_attachment_staging" ("migration_run_id", "downloaded_at")
        WHERE "downloaded_at" IS NULL
    `);

    // 2. jira_attachment_id on attachments — partial unique index for ON CONFLICT dedup
    await queryRunner.query(`
      ALTER TABLE "attachments"
        ADD COLUMN IF NOT EXISTS "jira_attachment_id" VARCHAR(100)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uidx_attachments_jira_id"
        ON "attachments" ("jira_attachment_id")
        WHERE "jira_attachment_id" IS NOT NULL
    `);

    // 3. Attachment progress counters on jira_migration_runs
    await queryRunner.query(`
      ALTER TABLE "jira_migration_runs"
        ADD COLUMN IF NOT EXISTS "total_attachments"     INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "processed_attachments" INT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jira_migration_runs" DROP COLUMN IF EXISTS "processed_attachments"`);
    await queryRunner.query(`ALTER TABLE "jira_migration_runs" DROP COLUMN IF EXISTS "total_attachments"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uidx_attachments_jira_id"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN IF EXISTS "jira_attachment_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_jira_attachment_staging_pending"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jira_migration_attachment_staging"`);
  }
}
