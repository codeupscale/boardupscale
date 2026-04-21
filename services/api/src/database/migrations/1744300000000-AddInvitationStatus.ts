import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitationStatus1744300000000 implements MigrationInterface {
  name = 'AddInvitationStatus1744300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column with default 'none'
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "invitation_status" VARCHAR(20) NOT NULL DEFAULT 'none'
    `);

    // Add CHECK constraint to enforce valid values at DB level
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "ck_users_invitation_status"
      CHECK ("invitation_status" IN ('none', 'pending', 'accepted', 'expired'))
    `);

    // Backfill active users who completed registration (password or OAuth) → 'accepted'.
    // These are real users who went through the invite/signup flow.
    // Note: jira_account_id is intentionally not used here — it may not exist on older DBs.
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'accepted'
      WHERE "is_active" = true
        AND "email" NOT LIKE '%@migrated.jira.local'
        AND ("password_hash" IS NOT NULL OR "oauth_provider" IS NOT NULL)
    `);

    // Active users without credentials and no synthetic email → Jira-imported with real email,
    // pending invitation (admin set email but user hasn't accepted yet).
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'pending'
      WHERE "is_active" = true
        AND "email" NOT LIKE '%@migrated.jira.local'
        AND "password_hash" IS NULL
        AND "oauth_provider" IS NULL
    `);

    // Inactive users with real email → pending invite not yet accepted
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'pending'
      WHERE "is_active" = false
        AND "email" NOT LIKE '%@migrated.jira.local'
    `);

    // Jira users with synthetic email → 'none' (no invite sent yet, awaiting real email from admin)
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'none'
      WHERE "email" LIKE '%@migrated.jira.local'
    `);

    // Index for member list filtering by org + status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_org_invitation_status"
      ON "users" ("organization_id", "invitation_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_org_invitation_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "ck_users_invitation_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "invitation_status"`);
  }
}
