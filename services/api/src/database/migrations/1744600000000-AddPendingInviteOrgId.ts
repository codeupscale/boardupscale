import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds users.pending_invite_organization_id so the invitation flow knows
 * which organization an invite is actually for.
 *
 * Before this migration, validateInvitation / acceptInvitation inferred the
 * target org from users.organization_id (the legacy "home" org). That broke
 * cross-org invites: if Alice was first imported via Jira into Org A, and
 * later invited to Org B, the accept flow added her to Org A again because
 * that's where users.organization_id still pointed.
 *
 * The new column is populated by generateAndSendInvitation with the actual
 * target org, cleared on accept/expire.
 */
export class AddPendingInviteOrgId1744600000000 implements MigrationInterface {
  name = 'AddPendingInviteOrgId1744600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pending_invite_organization_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_pending_invite_org"
      FOREIGN KEY ("pending_invite_organization_id")
      REFERENCES "organizations"("id")
      ON DELETE SET NULL
    `);

    // Best-effort backfill: for users with a pending invite token, assume the
    // invite targets their legacy organization_id. New invites overwrite this
    // with the actual target org.
    await queryRunner.query(`
      UPDATE "users"
      SET "pending_invite_organization_id" = "organization_id"
      WHERE "invitation_status" = 'pending'
        AND "email_verification_token" IS NOT NULL
        AND "organization_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_pending_invite_org"
      ON "users" ("pending_invite_organization_id")
      WHERE "pending_invite_organization_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_pending_invite_org"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_pending_invite_org"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pending_invite_organization_id"`);
  }
}
