import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenant notifications: every row is scoped to an organization.
 * Backfill from linked project when possible; drop orphans that cannot be scoped.
 */
export class AddNotificationOrganizationId1748300000000 implements MigrationInterface {
  public readonly name = 'AddNotificationOrganizationId1748300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN IF NOT EXISTS "organization_id" uuid
    `);

    // Prefer project → organization from notification payload
    await queryRunner.query(`
      UPDATE notifications n
      SET organization_id = p.organization_id
      FROM projects p
      WHERE n.organization_id IS NULL
        AND n.data->>'projectId' IS NOT NULL
        AND p.id = (n.data->>'projectId')::uuid
    `);

    // Fallback: issue → project → organization
    await queryRunner.query(`
      UPDATE notifications n
      SET organization_id = p.organization_id
      FROM issues i
      JOIN projects p ON p.id = i.project_id
      WHERE n.organization_id IS NULL
        AND n.data->>'issueId' IS NOT NULL
        AND i.id = (n.data->>'issueId')::uuid
    `);

    // Last resort: user's current organization_id (legacy single-home users)
    await queryRunner.query(`
      UPDATE notifications n
      SET organization_id = u.organization_id
      FROM users u
      WHERE n.organization_id IS NULL
        AND n.user_id = u.id
        AND u.organization_id IS NOT NULL
    `);

    // Unscoped rows cannot be tenant-safe — remove them
    await queryRunner.query(`
      DELETE FROM notifications WHERE organization_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "organization_id" SET NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "notifications"
          ADD CONSTRAINT "FK_notifications_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_org_user_created"
      ON "notifications" ("organization_id", "user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_org_user_unread"
      ON "notifications" ("organization_id", "user_id")
      WHERE "read_at" IS NULL
    `);

    // Extend default prefs shape for new users (sound channel)
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "notification_preferences"
      SET DEFAULT '{"email":true,"inApp":true,"sound":true}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_org_user_unread"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_org_user_created"`);
    await queryRunner.query(`
      ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "FK_notifications_organization"
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications" DROP COLUMN IF EXISTS "organization_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "notification_preferences"
      SET DEFAULT '{"email":true,"inApp":true}'::jsonb
    `);
  }
}
