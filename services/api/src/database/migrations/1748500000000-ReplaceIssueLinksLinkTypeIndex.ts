import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace weak single-column IDX_issue_links_link_type (from
 * AddOrgDashboardIndexes1748400000000) with composites that match
 * dashboard blocked-stats joins:
 *   (source_issue_id + is_blocked_by) OR (target_issue_id + blocks)
 *
 * Idempotent: safe on envs that already dropped/created these indexes.
 */
export class ReplaceIssueLinksLinkTypeIndex1748500000000
  implements MigrationInterface
{
  public readonly name = 'ReplaceIssueLinksLinkTypeIndex1748500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issue_links_link_type"`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issue_links_source_link_type"
        ON "issue_links" ("source_issue_id", "link_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issue_links_target_link_type"
        ON "issue_links" ("target_issue_id", "link_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_issue_links_target_link_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_issue_links_source_link_type"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issue_links_link_type"
        ON "issue_links" ("link_type")
    `);
  }
}
