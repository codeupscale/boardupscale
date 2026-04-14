import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed data migration — Boardupscale v1.0.0
 *
 * Inserts the immutable baseline data every fresh installation requires:
 *   - Granular permission definitions (resource × action pairs)
 *   - Four system roles:  Admin | Manager | Member | Viewer
 *   - Role → permission grants (RBAC matrix)
 *   - Three SaaS billing plans: Free | Pro | Enterprise
 *
 * All inserts use ON CONFLICT … DO NOTHING so this migration is safe to
 * re-run against a database that was bootstrapped via init-db.sql.
 */
export class SeedData1741651200001 implements MigrationInterface {
  public readonly name = 'SeedData1741651200001';

  // ─── UP ──────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Permissions ─────────────────────────────────────────────────────────
    // Each permission is a (resource, action) pair.  The unique constraint on
    // the permissions table prevents duplicates on idempotent re-runs.

    await queryRunner.query(`
      INSERT INTO "permissions" ("resource", "action", "description") VALUES
        -- Project
        ('project',      'create', 'Create new projects'),
        ('project',      'read',   'View project details'),
        ('project',      'update', 'Update project settings'),
        ('project',      'delete', 'Delete or archive projects'),
        ('project',      'manage', 'Full project management including settings'),
        -- Issue
        ('issue',        'create', 'Create new issues'),
        ('issue',        'read',   'View issues'),
        ('issue',        'update', 'Update issues'),
        ('issue',        'delete', 'Delete issues'),
        ('issue',        'assign', 'Assign issues to members'),
        -- Board
        ('board',        'read',   'View boards'),
        ('board',        'update', 'Modify board configuration'),
        ('board',        'manage', 'Full board management'),
        -- Sprint
        ('sprint',       'create', 'Create sprints'),
        ('sprint',       'read',   'View sprints'),
        ('sprint',       'update', 'Update sprints'),
        ('sprint',       'delete', 'Delete sprints'),
        ('sprint',       'manage', 'Start and complete sprints'),
        -- Comment
        ('comment',      'create', 'Post comments'),
        ('comment',      'read',   'View comments'),
        ('comment',      'update', 'Edit own comments'),
        ('comment',      'delete', 'Delete comments'),
        -- Work log
        ('worklog',      'create', 'Log work on issues'),
        ('worklog',      'read',   'View work logs'),
        ('worklog',      'update', 'Edit own work logs'),
        ('worklog',      'delete', 'Delete work logs'),
        -- Member management
        ('member',       'create', 'Add project members'),
        ('member',       'read',   'View project members'),
        ('member',       'update', 'Change member roles'),
        ('member',       'delete', 'Remove project members'),
        -- Page / Docs
        ('page',         'create', 'Create pages'),
        ('page',         'read',   'View pages'),
        ('page',         'update', 'Edit pages'),
        ('page',         'delete', 'Delete pages'),
        -- Organization
        ('organization', 'manage', 'Manage organization settings and billing'),
        -- AI
        ('ai',           'read',   'View AI feature settings and history'),
        ('ai',           'use',    'Use AI-powered features like suggestions and search'),
        ('ai',           'chat',   'Use AI chat assistant'),
        ('ai',           'admin',  'Manage AI configuration and models')
      ON CONFLICT ("resource", "action") DO NOTHING
    `);

    // ── System Roles ─────────────────────────────────────────────────────────
    // organization_id = NULL marks a global system role shared across all
    // tenants.  Custom per-org roles are scoped with a non-null organization_id.

    await queryRunner.query(`
      INSERT INTO "roles" ("organization_id", "name", "description", "is_system") VALUES
        (NULL, 'Admin',   'Full access to all resources and settings',             TRUE),
        (NULL, 'Manager', 'Manage projects, issues, sprints, and members',         TRUE),
        (NULL, 'Member',  'Create and manage own issues, comments, and work logs', TRUE),
        (NULL, 'Viewer',  'Read-only access to all resources',                     TRUE)
      ON CONFLICT ("organization_id", "name") DO NOTHING
    `);

    // ── Role → Permission Grants ──────────────────────────────────────────────

    // Admin: all permissions without exception.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Admin'
         AND r.is_system IS TRUE
         AND r.organization_id IS NULL
      ON CONFLICT DO NOTHING
    `);

    // Manager: everything except organization-level management.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Manager'
         AND r.is_system IS TRUE
         AND r.organization_id IS NULL
         AND NOT (p.resource = 'organization' AND p.action = 'manage')
         AND NOT (p.resource = 'ai' AND p.action = 'admin')
      ON CONFLICT DO NOTHING
    `);

    // Member: scoped create/read/update on their own work items.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Member'
         AND r.is_system IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'project'  AND p.action = 'read')
            OR (p.resource = 'board'    AND p.action = 'read')
            OR (p.resource = 'sprint'   AND p.action = 'read')
            OR (p.resource = 'issue'    AND p.action IN ('create', 'read', 'update'))
            OR (p.resource = 'comment'  AND p.action IN ('create', 'read', 'update'))
            OR (p.resource = 'worklog'  AND p.action IN ('create', 'read', 'update'))
            OR (p.resource = 'page'     AND p.action IN ('create', 'read', 'update'))
            OR (p.resource = 'member'   AND p.action = 'read')
            OR (p.resource = 'ai'       AND p.action IN ('read', 'use', 'chat'))
         )
      ON CONFLICT DO NOTHING
    `);

    // Viewer: read-only access to every resource.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name = 'Viewer'
         AND r.is_system IS TRUE
         AND r.organization_id IS NULL
         AND p.action = 'read'
      ON CONFLICT DO NOTHING
    `);

    // ── Billing Plans ─────────────────────────────────────────────────────────
    // prices are stored in cents (USD):  700 = $7.00/month.

    await queryRunner.query(`
      INSERT INTO "billing_plans"
        ("name", "slug", "price_monthly", "price_yearly", "max_users", "max_storage_gb", "features")
      VALUES
        ('Free',       'free',       0,     0,     5,  1,   '{"ai": false, "saml": false, "github": false}'),
        ('Pro',        'pro',        700,   7000,  25, 10,  '{"ai": true,  "saml": false, "github": true}'),
        ('Enterprise', 'enterprise', 1500,  15000, -1, 100, '{"ai": true,  "saml": true,  "github": true}')
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  // ─── DOWN ─────────────────────────────────────────────────────────────────
  // Removes only the seeded rows — not the tables themselves (those are
  // dropped by the InitialSchema migration's down() when called after this).

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Billing plans
    await queryRunner.query(`
      DELETE FROM "billing_plans" WHERE "slug" IN ('free', 'pro', 'enterprise')
    `);

    // Role → permission grants for system roles (cascade removes automatically
    // via FK if role rows are deleted, but we delete explicitly for clarity)
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "role_id" IN (
         SELECT id FROM "roles"
          WHERE is_system IS TRUE AND organization_id IS NULL
       )
    `);

    // System roles
    await queryRunner.query(`
      DELETE FROM "roles"
       WHERE is_system IS TRUE AND organization_id IS NULL
    `);

    // Permissions
    await queryRunner.query(`
      DELETE FROM "permissions"
       WHERE "resource" IN (
         'project', 'issue', 'board', 'sprint', 'comment',
         'worklog', 'member', 'page', 'organization', 'ai'
       )
    `);
  }
}
