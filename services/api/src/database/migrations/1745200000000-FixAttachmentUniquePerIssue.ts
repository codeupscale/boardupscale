import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The original global unique index on attachments.jira_attachment_id blocked
 * multi-tenant imports: if Org A imported a Jira project first, Org B's Phase 6
 * would hit ON CONFLICT DO NOTHING for every attachment and produce 0 records.
 *
 * Fix: drop the global index and replace it with a per-issue unique index
 * (issue_id, jira_attachment_id), which is the correct dedup boundary —
 * the same Jira attachment ID can legitimately exist in multiple orgs as long
 * as each instance is linked to a different issue row.
 */
export class FixAttachmentUniquePerIssue1745200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the global unique index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_attachments_jira_id"`,
    );

    // Create a per-issue unique index (multi-tenant safe)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_attachments_issue_jira_id"
       ON "attachments" ("issue_id", "jira_attachment_id")
       WHERE "jira_attachment_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_attachments_issue_jira_id"`,
    );

    // Restore the original global index (data loss risk if duplicates exist)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_attachments_jira_id"
       ON "attachments" ("jira_attachment_id")
       WHERE "jira_attachment_id" IS NOT NULL`,
    );
  }
}
