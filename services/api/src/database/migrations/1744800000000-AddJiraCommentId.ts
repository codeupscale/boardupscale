import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `jira_comment_id` to the `comments` table and a partial unique index
 * on (issue_id, jira_comment_id) so Jira re-imports can upsert rather than
 * duplicate comments.
 *
 * The index is partial (WHERE jira_comment_id IS NOT NULL) so native
 * Boardupscale comments (NULL jira_comment_id) are unaffected.
 */
export class AddJiraCommentId1744800000000 implements MigrationInterface {
  name = 'AddJiraCommentId1744800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD COLUMN IF NOT EXISTS "jira_comment_id" VARCHAR(100) NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_comments_issue_jira_comment_id"
        ON "comments" ("issue_id", "jira_comment_id")
        WHERE "jira_comment_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_comments_issue_jira_comment_id"`);
    await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN IF EXISTS "jira_comment_id"`);
  }
}
