import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make `jira_account_id` unique per (organization_id, jira_account_id) instead
 * of globally. Root cause of "members bulk upsert failed: duplicate key value
 * violates unique constraint IDX_users_jira_account_id" during Jira migration
 * into a second org: the old index forbade the same Jira user from existing
 * in two orgs, but the users table is org-scoped — it SHOULD be allowed.
 *
 * Result of the old index: every Jira user already imported into one org was
 * silently skipped when importing a second org that shared members with it,
 * producing a partial members list and cascade of broken assignments/role lookups.
 */
export class PerOrgJiraAccountIdUnique1744700000000 implements MigrationInterface {
  name = 'PerOrgJiraAccountIdUnique1744700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the new composite partial unique index BEFORE dropping the old
    // one — prevents a gap where duplicates could slip in mid-migration.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_org_jira_account_id"
        ON "users" ("organization_id", "jira_account_id")
        WHERE "jira_account_id" IS NOT NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_jira_account_id"`);

    // Keep a non-unique index on jira_account_id alone for the lookup
    // in migration phase 0 (accountId → user map rebuilds). The old index
    // was unique; we only lose uniqueness, not lookup speed.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_jira_account_id_lookup"
        ON "users" ("jira_account_id")
        WHERE "jira_account_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback requires the old global-unique shape. If any org has
    // duplicated a Jira account into another org after this migration ran,
    // the old unique index can't be recreated without first collapsing
    // those duplicates. Detect and fail loudly rather than hide the issue.
    const { rows } = await queryRunner.query(`
      SELECT jira_account_id, COUNT(*) AS n
      FROM "users"
      WHERE jira_account_id IS NOT NULL
      GROUP BY jira_account_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (rows.length > 0) {
      throw new Error(
        `Cannot revert: multiple users share jira_account_id=${rows[0].jira_account_id}. ` +
        `Rollback requires collapsing duplicates first — see the v1 ` +
        `JiraMemberReconciliation migration for the pattern.`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_jira_account_id_lookup"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_org_jira_account_id"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_jira_account_id"
        ON "users" ("jira_account_id")
        WHERE "jira_account_id" IS NOT NULL
    `);
  }
}
