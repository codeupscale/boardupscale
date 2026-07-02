import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds search:read permission and grants it to all system roles so every
 * authenticated org member can use global search (RBAC scoping stays in SearchService).
 */
export class AddSearchReadPermission1748100000000 implements MigrationInterface {
  public readonly name = 'AddSearchReadPermission1748100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("resource", "action", "description") VALUES
        ('search', 'read', 'Use global search across issues, projects, and members')
      ON CONFLICT ("resource", "action") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r."is_system" = TRUE
         AND r."organization_id" IS NULL
         AND p."resource" = 'search'
         AND p."action" = 'read'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
       USING "permissions" p
       WHERE rp."permission_id" = p."id"
         AND p."resource" = 'search'
         AND p."action" = 'read'
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
       WHERE "resource" = 'search'
         AND "action" = 'read'
    `);
  }
}
