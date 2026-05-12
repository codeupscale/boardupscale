import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RefactorOrgAndProjectRoles
 *
 * Implements the two-tier roles model:
 *   Org-level  roles: owner | user
 *   Project-level roles: admin | member | viewer
 *
 * Changes:
 *   1. Add `scope` column to the `roles` table.
 *   2. Stamp existing system roles with the correct scope.
 *   3. Insert the new `User` system org-role.
 *   4. Rebuild role_permissions for all system roles per new matrix.
 *   5. Backfill organization_members.role: admin/member/viewer → user.
 *   6. Backfill users.role default and existing non-owner values → user.
 *   7. Backfill project_members.role: developer → member.
 *   8. Update column defaults.
 */
export class RefactorOrgAndProjectRoles1747400000000 implements MigrationInterface {
  public readonly name = 'RefactorOrgAndProjectRoles1747400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Add scope column ───────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "roles"
        ADD COLUMN IF NOT EXISTS "scope" character varying(20) NOT NULL DEFAULT 'project'
    `);

    // ── 2. Stamp existing system roles ────────────────────────────────────────
    // Owner is an org-level role (was already inserted by AddOwnerSystemRole migration).
    await queryRunner.query(`
      UPDATE "roles"
         SET "scope" = 'org'
       WHERE "is_system" = TRUE
         AND "organization_id" IS NULL
         AND "name" = 'Owner'
    `);

    // Admin / Member / Viewer are project-level roles.
    await queryRunner.query(`
      UPDATE "roles"
         SET "scope" = 'project'
       WHERE "is_system" = TRUE
         AND "organization_id" IS NULL
         AND "name" IN ('Admin', 'Member', 'Viewer')
    `);

    // ── 3. Insert the new User system org-role ────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "roles" ("organization_id", "name", "description", "is_system", "scope")
      SELECT NULL, 'User', 'Default org member — personal/account access only', TRUE, 'org'
       WHERE NOT EXISTS (
         SELECT 1 FROM "roles" WHERE "name" = 'User' AND "is_system" = TRUE AND "organization_id" IS NULL
       )
    `);

    // ── 4. Rebuild role_permissions for all system roles ─────────────────────

    // 4a. Wipe ALL existing system role grants so we start clean.
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "role_id" IN (
         SELECT "id" FROM "roles"
          WHERE "is_system" = TRUE AND "organization_id" IS NULL
       )
    `);

    // 4b. Owner (org-scope): all permissions — unchanged.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Owner'
         AND r.is_system = TRUE
         AND r.organization_id IS NULL
      ON CONFLICT DO NOTHING
    `);

    // 4c. User (org-scope): only personal/AI permissions — no project access.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'User'
         AND r.is_system = TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'ai'    AND p.action IN ('read', 'use', 'chat'))
            OR (p.resource = 'users' AND p.action = 'browse')
         )
      ON CONFLICT DO NOTHING
    `);

    // 4d. Admin (project-scope): all permissions EXCEPT org-level ones.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Admin'
         AND r.is_system = TRUE
         AND r.organization_id IS NULL
         AND NOT (p.resource = 'organization' AND p.action = 'manage')
      ON CONFLICT DO NOTHING
    `);

    // 4e. Member (project-scope): project content permissions.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Member'
         AND r.is_system = TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'project'       AND p.action IN ('read'))
            OR (p.resource = 'board'         AND p.action IN ('read'))
            OR (p.resource = 'sprint'        AND p.action IN ('read'))
            OR (p.resource = 'issue'         AND p.action IN ('create', 'read', 'update', 'assign',
                                                              'assignable', 'transition', 'resolve',
                                                              'close', 'link', 'schedule', 'bulk-change',
                                                              'vote'))
            OR (p.resource = 'comment'       AND p.action IN ('create', 'read', 'update:own', 'delete:own'))
            OR (p.resource = 'worklog'       AND p.action IN ('create', 'read', 'update:own', 'delete:own'))
            OR (p.resource = 'page'          AND p.action IN ('create', 'read', 'update', 'delete:own'))
            OR (p.resource = 'member'        AND p.action = 'read')
            OR (p.resource = 'automation'    AND p.action = 'read')
            OR (p.resource = 'component'     AND p.action IN ('create', 'read', 'update'))
            OR (p.resource = 'version'       AND p.action = 'read')
            OR (p.resource = 'custom-field'  AND p.action = 'read')
            OR (p.resource = 'attachment'    AND p.action IN ('read', 'create', 'delete:own'))
            OR (p.resource = 'voter'         AND p.action = 'read')
            OR (p.resource = 'watcher'       AND p.action IN ('add-self', 'manage', 'read'))
            OR (p.resource = 'archive'       AND p.action = 'read:project')
            OR (p.resource = 'workflow'      AND p.action = 'read')
            OR (p.resource = 'dev-tools'     AND p.action = 'read')
            OR (p.resource = 'ai'            AND p.action IN ('read', 'use', 'chat'))
            OR (p.resource = 'users'         AND p.action = 'browse')
         )
      ON CONFLICT DO NOTHING
    `);

    // 4f. Viewer (project-scope): read-only access.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Viewer'
         AND r.is_system = TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'project'      AND p.action = 'read')
            OR (p.resource = 'board'        AND p.action = 'read')
            OR (p.resource = 'sprint'       AND p.action = 'read')
            OR (p.resource = 'issue'        AND p.action IN ('read', 'vote'))
            OR (p.resource = 'comment'      AND p.action = 'read')
            OR (p.resource = 'worklog'      AND p.action = 'read')
            OR (p.resource = 'page'         AND p.action = 'read')
            OR (p.resource = 'member'       AND p.action = 'read')
            OR (p.resource = 'automation'   AND p.action = 'read')
            OR (p.resource = 'component'    AND p.action = 'read')
            OR (p.resource = 'version'      AND p.action = 'read')
            OR (p.resource = 'custom-field' AND p.action = 'read')
            OR (p.resource = 'attachment'   AND p.action = 'read')
            OR (p.resource = 'voter'        AND p.action = 'read')
            OR (p.resource = 'watcher'      AND p.action IN ('add-self', 'read'))
            OR (p.resource = 'archive'      AND p.action = 'read:project')
            OR (p.resource = 'workflow'     AND p.action = 'read')
            OR (p.resource = 'dev-tools'    AND p.action = 'read')
            OR (p.resource = 'ai'           AND p.action IN ('read', 'use', 'chat'))
            OR (p.resource = 'users'        AND p.action = 'browse')
         )
      ON CONFLICT DO NOTHING
    `);

    // ── 5. Backfill organization_members.role ─────────────────────────────────
    // admin / member / viewer → user  (only owner stays).
    await queryRunner.query(`
      UPDATE "organization_members"
         SET "role" = 'user'
       WHERE "role" IN ('admin', 'member', 'viewer')
    `);

    // Update the column default.
    await queryRunner.query(`
      ALTER TABLE "organization_members"
        ALTER COLUMN "role" SET DEFAULT 'user'
    `);

    // ── 6. Backfill users.role ────────────────────────────────────────────────
    await queryRunner.query(`
      UPDATE "users"
         SET "role" = 'user'
       WHERE "role" IN ('admin', 'member', 'viewer', 'manager', 'developer')
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" SET DEFAULT 'user'
    `);

    // ── 7. Backfill project_members.role ─────────────────────────────────────
    // developer → member; admin stays admin.
    await queryRunner.query(`
      UPDATE "project_members"
         SET "role" = 'member'
       WHERE "role" IN ('developer', 'viewer', 'user', 'manager')
    `);

    // 'admin' project_member rows stay 'admin' — they are already correct.

    await queryRunner.query(`
      ALTER TABLE "project_members"
        ALTER COLUMN "role" SET DEFAULT 'member'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Restore project_members.role default ──────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "project_members"
        ALTER COLUMN "role" SET DEFAULT 'developer'
    `);
    // Note: we cannot reliably reverse individual row backfills for project members
    // since we don't know which 'member' rows were originally 'developer'.

    // ── Restore users.role default ────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" SET DEFAULT 'member'
    `);
    await queryRunner.query(`
      UPDATE "users"
         SET "role" = 'member'
       WHERE "role" = 'user'
    `);

    // ── Restore organization_members.role default ─────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "organization_members"
        ALTER COLUMN "role" SET DEFAULT 'member'
    `);
    // Cannot reliably know original roles so we don't backfill individual rows.

    // ── Remove User system role ───────────────────────────────────────────────
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "role_id" IN (
         SELECT "id" FROM "roles"
          WHERE "name" = 'User' AND "is_system" = TRUE AND "organization_id" IS NULL
       )
    `);
    await queryRunner.query(`
      DELETE FROM "roles"
       WHERE "name" = 'User' AND "is_system" = TRUE AND "organization_id" IS NULL
    `);

    // ── Reset Owner/Admin/Member/Viewer to pre-refactor grants ────────────────
    // Re-grant admin=all, member=scoped, viewer=read-only as the previous state had.
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "role_id" IN (
         SELECT "id" FROM "roles"
          WHERE "is_system" = TRUE AND "organization_id" IS NULL AND "name" IN ('Owner', 'Admin', 'Member', 'Viewer')
       )
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r CROSS JOIN "permissions" p
       WHERE r.name IN ('Owner', 'Admin') AND r.is_system = TRUE AND r.organization_id IS NULL
      ON CONFLICT DO NOTHING
    `);

    // ── Drop scope column ─────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "roles" DROP COLUMN IF EXISTS "scope"
    `);
  }
}
