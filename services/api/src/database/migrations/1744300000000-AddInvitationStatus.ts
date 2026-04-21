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

    // Backfill non-Jira active users → 'accepted' (they genuinely accepted an invite or registered normally)
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'accepted'
      WHERE "is_active" = true
        AND "jira_account_id" IS NULL
        AND "email" NOT LIKE '%@migrated.jira.local'
    `);

    // Backfill non-Jira inactive users → 'pending' (pending invite, not yet accepted)
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'pending'
      WHERE "is_active" = false
        AND "email" NOT LIKE '%@migrated.jira.local'
    `);

    // Backfill Jira users with real email → 'pending'
    // Worker sets is_active=true for ALL Jira users regardless of email type,
    // but real-email Jira users still need to accept an invite (no password set).
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'pending'
      WHERE "jira_account_id" IS NOT NULL
        AND "email" NOT LIKE '%@migrated.jira.local'
        AND "password_hash" IS NULL
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
