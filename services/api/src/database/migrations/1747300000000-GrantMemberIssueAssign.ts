import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GrantMemberIssueAssign — grants `issue:assign` to the Member system role.
 *
 * The original SeedData migration only granted Member:
 *   issue IN ('create', 'read', 'update')
 * The CSV spec (BoardUpscale_Roles_Permissions_v3.csv) grants `issue:assign`
 * to Owner ✅ / Admin ✅ / Member ✅ / Viewer ❌.
 *
 * The `issue:assign` permission row already exists in the `permissions` table
 * (seeded in SeedData). This migration simply adds the missing role grant.
 */
export class GrantMemberIssueAssign1747300000000 implements MigrationInterface {
  public readonly name = 'GrantMemberIssueAssign1747300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Member'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'issue'
         AND p.action          = 'assign'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
       WHERE role_id IN (
               SELECT id FROM roles
                WHERE name = 'Member' AND is_system IS TRUE AND organization_id IS NULL
             )
         AND permission_id IN (
               SELECT id FROM permissions
                WHERE resource = 'issue' AND action = 'assign'
             )
    `);
  }
}
