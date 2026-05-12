import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ImplementFullPermissionsMatrix
 *
 * Aligns the DB roles & permissions model with BoardUpscale_Roles_Permissions_v3.csv (O1–O34, P1–P61).
 *
 * Changes:
 *  1. Insert all 32 granular org-level permissions (organization:*)
 *  2. Insert the `Administrator` system org-role (scope='org', is_system=TRUE)
 *  3. Grant Owner all new org permissions (O1–O34)
 *  4. Grant Administrator all org permissions EXCEPT O1/O2/O3 (delete, transfer-ownership, manage-billing)
 *  5. Grant User (org-level Member) O13/O17/O18: view-directory, view-teams, project:create
 *  6. Fix P18 bug: revoke component:create/update from project-level Member role (CSV: Project Member=No)
 *  7. Add board:create permission and grant to project-level Member (P13: Own only)
 */
export class ImplementFullPermissionsMatrix1747500000000 implements MigrationInterface {
  public readonly name = 'ImplementFullPermissionsMatrix1747500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Insert granular organization-level permissions ─────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("resource", "action", "description") VALUES
        ('organization', 'delete',                    'Permanently delete the organization and all data (Owner only)'),
        ('organization', 'transfer-ownership',        'Transfer the Owner role to an existing Administrator (Owner only)'),
        ('organization', 'manage-billing',            'Upgrade/downgrade plan and manage payment method (Owner only)'),
        ('organization', 'view-billing',              'View invoices and billing history'),
        ('organization', 'edit-profile',              'Edit organization name, logo, slug, and description'),
        ('organization', 'invite-member',             'Send invitation emails with role and project assignments'),
        ('organization', 'revoke-invite',             'Cancel a pending invitation before acceptance'),
        ('organization', 'remove-member',             'Soft-delete a user''s org membership'),
        ('organization', 'change-member-role',        'Change a member''s organization role (promote/demote)'),
        ('organization', 'force-reset-password',      'Trigger a forced password-reset email for a member'),
        ('organization', 'view-directory',            'View all organization members and their roles'),
        ('organization', 'create-team',               'Create a team or group within the organization'),
        ('organization', 'edit-team',                 'Add or remove users from a team'),
        ('organization', 'delete-team',               'Remove a team and unbind it from projects'),
        ('organization', 'view-teams',                'Browse the list of all teams in the organization'),
        ('organization', 'delete-any-project',        'Delete any project in the organization regardless of project role'),
        ('organization', 'archive-any-project',       'Archive or unarchive any project in the organization'),
        ('organization', 'access-any-project',        'Access any project including private ones without an explicit invite'),
        ('organization', 'transfer-project',          'Reassign Project Admin from one user to another'),
        ('organization', 'manage-integrations',       'Install or uninstall organization-level integrations (Slack, GitHub, etc.)'),
        ('organization', 'manage-api-tokens',         'Create and revoke organization API tokens and webhook endpoints'),
        ('organization', 'manage-marketplace',        'Install or uninstall Marketplace and third-party apps'),
        ('organization', 'configure-sso',             'Configure SSO, SAML, and SCIM identity provider integration'),
        ('organization', 'configure-security-policies','Set password complexity rules and MFA enforcement'),
        ('organization', 'manage-email-domains',      'Restrict organization membership to specific email domains'),
        ('organization', 'view-audit-log',            'Read all audit log entries for the organization'),
        ('organization', 'export-audit-log',          'Download the organization audit log as CSV or JSON'),
        ('organization', 'manage-custom-fields',      'Create and edit organization-wide custom field definitions'),
        ('organization', 'manage-workflow-templates', 'Create and edit organization-wide workflow templates'),
        ('organization', 'bulk-import-export',        'Run bulk import or full organization data export'),
        ('organization', 'configure-notifications',   'Configure organization-wide notification settings and defaults'),
        ('organization', 'manage-roles',              'Create, update, and delete custom roles within the organization')
      ON CONFLICT ("resource", "action") DO NOTHING
    `);

    // ── 2. Insert board:create permission ─────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("resource", "action", "description") VALUES
        ('board', 'create', 'Create personal board views and configurations')
      ON CONFLICT ("resource", "action") DO NOTHING
    `);

    // ── 3. Insert Administrator system role (org-scope) ───────────────────────
    await queryRunner.query(`
      INSERT INTO "roles" ("organization_id", "name", "description", "is_system", "scope")
      SELECT NULL,
             'Administrator',
             'Org administrator — full org management except billing, delete, and ownership transfer',
             TRUE,
             'org'
       WHERE NOT EXISTS (
         SELECT 1 FROM "roles"
          WHERE "name" = 'Administrator'
            AND "is_system" = TRUE
            AND "organization_id" IS NULL
       )
    `);

    // ── 4. Grant Owner all new organization permissions (O1–O34) ─────────────
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name            = 'Owner'
         AND r.is_system       = TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'organization'
      ON CONFLICT DO NOTHING
    `);

    // ── 5. Grant Administrator all org permissions EXCEPT O1/O2/O3 ───────────
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name            = 'Administrator'
         AND r.is_system       = TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'organization'
         AND p.action NOT IN ('delete', 'transfer-ownership', 'manage-billing')
      ON CONFLICT DO NOTHING
    `);

    // Also grant Administrator project:create (O18: Admin can create projects)
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name            = 'Administrator'
         AND r.is_system       = TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'project'
         AND p.action          = 'create'
      ON CONFLICT DO NOTHING
    `);

    // ── 6. Grant User (org Member) O13/O17 and O18 (project:create) ──────────
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name            = 'User'
         AND r.is_system       = TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'organization' AND p.action IN ('view-directory', 'view-teams'))
            OR (p.resource = 'project'      AND p.action = 'create')
         )
      ON CONFLICT DO NOTHING
    `);

    // ── 7. Fix P18: revoke component:create and component:update from project Member ──
    // CSV says Project Member = No for "Manage components/labels at project level".
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "role_id" IN (
               SELECT "id" FROM "roles"
                WHERE "name" = 'Member'
                  AND "is_system" = TRUE
                  AND "organization_id" IS NULL
             )
         AND "permission_id" IN (
               SELECT "id" FROM "permissions"
                WHERE "resource" = 'component'
                  AND "action"   IN ('create', 'update')
             )
    `);

    // ── 8. Grant board:create to project Member (P13: Member can create own views) ──
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name            = 'Member'
         AND r.is_system       = TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'board'
         AND p.action          = 'create'
      ON CONFLICT DO NOTHING
    `);

    // Also grant board:create to Admin and Owner (they can do everything a Member can).
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name IN ('Owner', 'Admin')
         AND r.is_system       = TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'board'
         AND p.action          = 'create'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Restore component:create/update grants for project Member ─────────────
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
        FROM "roles" r
        CROSS JOIN "permissions" p
       WHERE r.name            = 'Member'
         AND r.is_system       = TRUE
         AND r.organization_id IS NULL
         AND p.resource        = 'component'
         AND p.action          IN ('create', 'update')
      ON CONFLICT DO NOTHING
    `);

    // ── Remove board:create grants ────────────────────────────────────────────
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "permission_id" IN (
         SELECT "id" FROM "permissions" WHERE "resource" = 'board' AND "action" = 'create'
       )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "resource" = 'board' AND "action" = 'create'
    `);

    // ── Remove User role org grants ───────────────────────────────────────────
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "role_id" IN (
               SELECT "id" FROM "roles"
                WHERE "name" = 'User' AND "is_system" = TRUE AND "organization_id" IS NULL
             )
         AND "permission_id" IN (
               SELECT "id" FROM "permissions"
                WHERE (resource = 'organization' AND action IN ('view-directory', 'view-teams'))
                   OR (resource = 'project'      AND action = 'create')
             )
    `);

    // ── Remove Administrator role and its grants ──────────────────────────────
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "role_id" IN (
         SELECT "id" FROM "roles"
          WHERE "name" = 'Administrator' AND "is_system" = TRUE AND "organization_id" IS NULL
       )
    `);
    await queryRunner.query(`
      DELETE FROM "roles"
       WHERE "name" = 'Administrator' AND "is_system" = TRUE AND "organization_id" IS NULL
    `);

    // ── Remove all new organization permissions ───────────────────────────────
    await queryRunner.query(`
      DELETE FROM "role_permissions"
       WHERE "permission_id" IN (
         SELECT "id" FROM "permissions"
          WHERE "resource" = 'organization'
            AND "action" IN (
              'delete', 'transfer-ownership', 'manage-billing', 'view-billing',
              'edit-profile', 'invite-member', 'revoke-invite', 'remove-member',
              'change-member-role', 'force-reset-password', 'view-directory',
              'create-team', 'edit-team', 'delete-team', 'view-teams',
              'delete-any-project', 'archive-any-project', 'access-any-project',
              'transfer-project', 'manage-integrations', 'manage-api-tokens',
              'manage-marketplace', 'configure-sso', 'configure-security-policies',
              'manage-email-domains', 'view-audit-log', 'export-audit-log',
              'manage-custom-fields', 'manage-workflow-templates',
              'bulk-import-export', 'configure-notifications', 'manage-roles'
            )
       )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
       WHERE "resource" = 'organization'
         AND "action" IN (
           'delete', 'transfer-ownership', 'manage-billing', 'view-billing',
           'edit-profile', 'invite-member', 'revoke-invite', 'remove-member',
           'change-member-role', 'force-reset-password', 'view-directory',
           'create-team', 'edit-team', 'delete-team', 'view-teams',
           'delete-any-project', 'archive-any-project', 'access-any-project',
           'transfer-project', 'manage-integrations', 'manage-api-tokens',
           'manage-marketplace', 'configure-sso', 'configure-security-policies',
           'manage-email-domains', 'view-audit-log', 'export-audit-log',
           'manage-custom-fields', 'manage-workflow-templates',
           'bulk-import-export', 'configure-notifications', 'manage-roles'
         )
    `);
  }
}
