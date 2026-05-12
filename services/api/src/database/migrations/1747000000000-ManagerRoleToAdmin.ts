import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ManagerRoleToAdmin — removes the 'Manager' system role from Boardupscale.
 *
 * The CSV spec (BoardUpscale_Roles_Permissions_v3.csv) defines exactly four
 * roles: Owner, Admin, Member, Viewer.  'Manager' is not specified and is
 * being retired.
 *
 * What this migration does:
 *  1. Re-points every project_members row whose role_id targets the Manager
 *     system role to the Admin system role instead.
 *  2. Updates the legacy string columns (users.role, organization_members.role,
 *     project_members.role) from 'manager' → 'admin'.
 *  3. Deletes the Manager system role (role_permissions cascade-deletes via FK).
 *
 * Rollback (down):
 *  Re-creates the Manager system role with its original permission set and
 *  reverts all 'admin' values that originated from 'manager' — impossible to
 *  distinguish without a tombstone, so down() logs a warning and is a no-op
 *  for the legacy string columns (safe, conservative).
 */
export class ManagerRoleToAdmin1747000000000 implements MigrationInterface {
  public readonly name = 'ManagerRoleToAdmin1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Re-point project_members.role_id that targets Manager → Admin ──
    await queryRunner.query(`
      UPDATE project_members pm
         SET role_id = admin_role.id
        FROM (
          SELECT id FROM roles WHERE name = 'Admin' AND is_system = TRUE AND organization_id IS NULL
        ) AS admin_role,
        (
          SELECT id FROM roles WHERE name = 'Manager' AND is_system = TRUE AND organization_id IS NULL
        ) AS manager_role
       WHERE pm.role_id = manager_role.id
    `);

    // ── 2. Update legacy 'manager' string values → 'admin' ─────────────────
    await queryRunner.query(`
      UPDATE users SET role = 'admin' WHERE role = 'manager'
    `);
    await queryRunner.query(`
      UPDATE organization_members SET role = 'admin' WHERE role = 'manager'
    `);
    await queryRunner.query(`
      UPDATE project_members SET role = 'admin' WHERE role = 'manager'
    `);

    // ── 3. Delete Manager system role ────────────────────────────────────────
    // role_permissions rows cascade-delete via the ON DELETE CASCADE FK.
    await queryRunner.query(`
      DELETE FROM roles
       WHERE name = 'Manager'
         AND is_system = TRUE
         AND organization_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-create Manager system role with original permission set.
    await queryRunner.query(`
      INSERT INTO roles (organization_id, name, description, is_system)
      SELECT NULL, 'Manager', 'Manage projects, issues, sprints, and members', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM roles WHERE name = 'Manager' AND is_system = TRUE AND organization_id IS NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name = 'Manager'
         AND r.is_system IS TRUE
         AND r.organization_id IS NULL
         AND NOT (p.resource = 'organization' AND p.action = 'manage')
         AND NOT (p.resource = 'ai'           AND p.action = 'admin')
         AND NOT (p.resource = 'api-key'      AND p.action = 'delete')
      ON CONFLICT DO NOTHING
    `);

    // NOTE: legacy string columns (users.role, org_members.role, project_members.role)
    // cannot be reliably reverted — we do not know which 'admin' rows were
    // originally 'manager'.  This is acceptable; the data is still valid.
  }
}
