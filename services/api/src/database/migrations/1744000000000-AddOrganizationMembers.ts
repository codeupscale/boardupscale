import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddOrganizationMembers
 *
 * Introduces the `organization_members` join table to support multi-org
 * membership. Previously, `users.organization_id` was a single FK, meaning
 * a user could belong to only one org. The Jira migration upsert would
 * overwrite `organization_id` on email conflict, effectively stealing users
 * between orgs.
 *
 * Changes:
 *   1. CREATE TABLE organization_members (user_id, organization_id, role, is_default)
 *   2. ADD COLUMN organization_id to refresh_tokens (org context on token refresh)
 *   3. Backfill organization_members from existing users.organization_id
 *   4. Backfill refresh_tokens.organization_id from users
 *
 * Gate checks:
 *   - All new columns nullable or have defaults
 *   - Unique constraint on (user_id, organization_id)
 *   - Indexes on user_id and organization_id
 *   - Full down() reverses up() exactly
 *   - organization_id scoped throughout
 */
export class AddOrganizationMembers1744000000000 implements MigrationInterface {
  name = 'AddOrganizationMembers1744000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create organization_members table
    await queryRunner.query(`
      CREATE TABLE "organization_members" (
        "id"               uuid              NOT NULL DEFAULT gen_random_uuid(),
        "user_id"          uuid              NOT NULL,
        "organization_id"  uuid              NOT NULL,
        "role"             character varying(50) NOT NULL DEFAULT 'member',
        "is_default"       boolean           NOT NULL DEFAULT false,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organization_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organization_members_user_org" UNIQUE ("user_id", "organization_id"),
        CONSTRAINT "FK_organization_members_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_organization_members_organization_id"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_organization_members_organization_id" ON "organization_members" ("organization_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_organization_members_user_id" ON "organization_members" ("user_id")
    `);

    // 2. Add nullable organization_id to refresh_tokens for org context preservation
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ADD COLUMN IF NOT EXISTS "organization_id" uuid NULL
    `);

    // 3. Backfill organization_members from existing users
    await queryRunner.query(`
      INSERT INTO "organization_members" ("user_id", "organization_id", "role", "is_default")
      SELECT "id", "organization_id", "role", true
      FROM "users"
      WHERE "organization_id" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    // 4. Backfill refresh_tokens.organization_id from users
    await queryRunner.query(`
      UPDATE "refresh_tokens" rt
      SET "organization_id" = u."organization_id"
      FROM "users" u
      WHERE u."id" = rt."user_id"
        AND rt."organization_id" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse step 2: drop organization_id from refresh_tokens
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        DROP COLUMN IF EXISTS "organization_id"
    `);

    // Reverse step 1: drop organization_members table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "organization_members"
    `);
  }
}
