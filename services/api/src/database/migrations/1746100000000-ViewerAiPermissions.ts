import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grant Viewer role the ability to use Upsy (AI chat assistant).
 *
 * Before this migration the Viewer system role only had `action = 'read'`
 * permissions across all resources.  That meant Viewers could see the Upsy
 * button (via `ai:read` on GET /ai/status) but got 403 on every chat call
 * because the chat endpoints require `ai:use` and `ai:chat`.
 *
 * After this migration Viewers can:
 *   ✅  ai:use  — use AI-powered features (suggestions, summaries)
 *   ✅  ai:chat — send and receive Upsy messages
 *
 * Viewers still CANNOT:
 *   ❌  ai:admin — manage AI configuration / models (Owner/Admin only)
 */
export class ViewerAiPermissions1746100000000 implements MigrationInterface {
  public readonly name = 'ViewerAiPermissions1746100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name            = 'Viewer'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'ai'
         AND p.action          IN ('use', 'chat')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE role_id IN (
         SELECT id FROM "roles"
          WHERE name = 'Viewer' AND is_system IS TRUE AND organization_id IS NULL
       )
         AND permission_id IN (
         SELECT id FROM "permissions"
          WHERE resource = 'ai' AND action IN ('use', 'chat')
       )
    `);
  }
}
