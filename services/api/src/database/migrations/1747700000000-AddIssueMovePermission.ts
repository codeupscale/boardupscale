import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CSV sync — P27 and P28:
 *
 * P28: "Move tasks to another project" — Member = No.
 *   `POST /issues/bulk-move` was guarded by `issue:update` which Member has.
 *   We introduce `issue:move` and grant it only to Admin and Manager.
 *   The controller is updated to require `issue:move` for bulk-move.
 *
 * P27: "Delete own task" — Member = Yes.
 *   Member lacked `issue:delete` entirely, preventing own-task deletion.
 *   We grant `issue:delete` to Member. Own-only enforcement is handled
 *   at the service layer (same pattern as comment:delete).
 *
 * Rollback removes the `issue:move` permission and revokes the Member
 * `issue:delete` grant.
 */
export class AddIssueMovePermission1747700000000 implements MigrationInterface {
  public readonly name = 'AddIssueMovePermission1747700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the issue:move permission
    await queryRunner.query(`
      INSERT INTO permissions (resource, action)
      VALUES ('issue', 'move')
      ON CONFLICT (resource, action) DO NOTHING;
    `);

    // 2. Grant issue:move to Admin and Manager project roles
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('Admin', 'Manager')
        AND r.is_system = TRUE
        AND r.organization_id IS NULL
        AND p.resource = 'issue'
        AND p.action = 'move'
      ON CONFLICT DO NOTHING;
    `);

    // 3. Grant issue:delete to Member (P27 — own-delete enforced in service)
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'Member'
        AND r.is_system = TRUE
        AND r.organization_id IS NULL
        AND p.resource = 'issue'
        AND p.action = 'delete'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove issue:delete from Member
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE role_id = (
        SELECT id FROM roles
        WHERE name = 'Member' AND is_system = TRUE AND organization_id IS NULL
      )
      AND permission_id = (
        SELECT id FROM permissions WHERE resource = 'issue' AND action = 'delete'
      );
    `);

    // Remove issue:move grants and the permission row
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id = (
        SELECT id FROM permissions WHERE resource = 'issue' AND action = 'move'
      );
    `);

    await queryRunner.query(`
      DELETE FROM permissions WHERE resource = 'issue' AND action = 'move';
    `);
  }
}
