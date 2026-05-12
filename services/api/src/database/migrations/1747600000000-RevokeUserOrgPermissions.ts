import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Strip all org-level permissions from the `User` system role so that
 * org Users have zero org permissions by default.
 *
 * Before this migration the User system role had:
 *   - organization:view-directory  (O13)
 *   - organization:view-teams      (O17)
 *   - project:create               (O18)
 *
 * After this migration a user must be explicitly added to a project with a
 * project role (viewer / member / admin) before they can do anything.
 *
 * Rollback re-grants those three permissions.
 */
export class RevokeUserOrgPermissions1747600000000 implements MigrationInterface {
  public readonly name = 'RevokeUserOrgPermissions1747600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE role_id = (
        SELECT id FROM roles
        WHERE name = 'User' AND is_system = TRUE AND organization_id IS NULL
      )
      AND permission_id IN (
        SELECT id FROM permissions
        WHERE (resource = 'organization' AND action IN ('view-directory', 'view-teams'))
           OR (resource = 'project'      AND action = 'create')
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'User' AND r.is_system = TRUE AND r.organization_id IS NULL
        AND (
          (p.resource = 'organization' AND p.action IN ('view-directory', 'view-teams'))
          OR (p.resource = 'project'   AND p.action = 'create')
        )
      ON CONFLICT DO NOTHING;
    `);
  }
}
