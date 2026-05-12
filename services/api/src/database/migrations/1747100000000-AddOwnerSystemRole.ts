import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddOwnerSystemRole — adds 'Owner' as a declarative system role in the DB.
 *
 * Previously Owner was a pure code-level bypass (isOrgOwner() short-circuit)
 * with no matching row in the roles table.  This migration creates the role
 * and grants it ALL permissions so the RBAC matrix is fully expressed in data,
 * not implicitly in code.  The code-level bypass stays as a fast-path; having
 * the DB row makes audits, role-management UIs, and the diff doc accurate.
 */
export class AddOwnerSystemRole1747100000000 implements MigrationInterface {
  public readonly name = 'AddOwnerSystemRole1747100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert Owner system role (idempotent).
    await queryRunner.query(`
      INSERT INTO roles (organization_id, name, description, is_system)
      SELECT NULL, 'Owner', 'Organization owner — full control including ownership transfer', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM roles WHERE name = 'Owner' AND is_system = TRUE AND organization_id IS NULL
      )
    `);

    // Grant Owner every permission.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Owner'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
       WHERE role_id IN (
         SELECT id FROM roles
          WHERE name = 'Owner' AND is_system = TRUE AND organization_id IS NULL
       )
    `);
    await queryRunner.query(`
      DELETE FROM roles
       WHERE name = 'Owner' AND is_system = TRUE AND organization_id IS NULL
    `);
  }
}
