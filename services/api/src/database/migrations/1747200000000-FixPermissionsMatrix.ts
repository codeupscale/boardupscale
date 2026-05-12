import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FixPermissionsMatrix — aligns the DB permission grant matrix with the
 * BoardUpscale_Roles_Permissions_v3.csv spec.
 *
 * Changes:
 *  A. Insert 29 missing permission rows (attachment, archive, watcher, voter,
 *     issue granulars, users:browse, workflow:read, dev-tools:read,
 *     project:extended-admin, :own/:any comment/worklog/page variants).
 *  B. Fix wrong grants — revoke webhook:read and api-key:read from Member and
 *     Viewer (CSV explicitly denies both).
 *  C. Fix missing grants — grant Member comment:delete, worklog:delete,
 *     page:delete (CSV grants these as :own-scoped for Member).
 *  D. Grant :own variants to Member; grant :any variants to Admin and Owner.
 *  E. Grant the new permissions to Owner/Admin/Member/Viewer per CSV matrix.
 */
export class FixPermissionsMatrix1747200000000 implements MigrationInterface {
  public readonly name = 'FixPermissionsMatrix1747200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── A. Insert missing permissions ────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO permissions (resource, action, description) VALUES
        -- Project
        ('project',     'extended-admin',   'Edit project workflows and screens within guardrails'),
        -- Workflow / Dev tools (read-only display)
        ('workflow',    'read',             'View read-only workflow on issue view'),
        ('dev-tools',   'read',             'View development panel (commits, branches, PRs)'),
        -- Issue granulars
        ('issue',       'assignable',       'Can be assigned to issues (appears in assignee picker)'),
        ('issue',       'transition',       'Change issue status via workflow transitions'),
        ('issue',       'resolve',          'Resolve and reopen issues'),
        ('issue',       'close',            'Close issues based on workflow conditions'),
        ('issue',       'link',             'Link issues to each other'),
        ('issue',       'schedule',         'Edit Due Date and Sprint fields'),
        ('issue',       'move',             'Move issues between projects or workflows'),
        ('issue',       'modify-reporter',  'Change the reporter of an issue'),
        ('issue',       'set-security',     'Set issue-level security to restrict visibility'),
        ('issue',       'bulk-change',      'Perform bulk operations on multiple issues'),
        ('issue',       'vote',             'Vote on issues'),
        ('issue',       'archive',          'Archive issues in a project'),
        ('issue',       'restore',          'Restore archived issues'),
        -- Voter / Watcher
        ('voter',       'read',             'View who has voted on an issue'),
        ('watcher',     'add-self',         'Watch issues and receive notifications'),
        ('watcher',     'manage',           'Add or remove other users from watcher list'),
        ('watcher',     'read',             'View list of watchers on an issue'),
        -- Archive browsing
        ('archive',     'read:project',     'Browse archived issues in a project'),
        ('archive',     'read:all',         'Browse all archived issues across the org'),
        -- Attachment
        ('attachment',  'read',             'View attachments on issues'),
        ('attachment',  'create',           'Attach files to issues'),
        ('attachment',  'delete:own',       'Delete own attachments'),
        ('attachment',  'delete:any',       'Delete any user''s attachment'),
        -- Users browse
        ('users',       'browse',           'Search users globally for assignees, watchers, mentions'),
        -- :own / :any granular variants for comment, worklog, page
        ('comment',     'update:own',       'Edit own comments'),
        ('comment',     'update:any',       'Edit any user''s comment'),
        ('comment',     'delete:own',       'Delete own comments'),
        ('comment',     'delete:any',       'Delete any user''s comment'),
        ('worklog',     'update:own',       'Edit own work logs'),
        ('worklog',     'update:any',       'Edit any user''s work log'),
        ('worklog',     'delete:own',       'Delete own work logs'),
        ('worklog',     'delete:any',       'Delete any user''s work log'),
        ('page',        'delete:own',       'Delete own pages'),
        ('page',        'delete:any',       'Delete any user''s page')
      ON CONFLICT (resource, action) DO NOTHING
    `);

    // ── B. Revoke wrong grants from Member: webhook:read, api-key:read ───────
    await queryRunner.query(`
      DELETE FROM role_permissions
       WHERE role_id IN (
               SELECT id FROM roles WHERE name IN ('Member', 'Viewer') AND is_system = TRUE AND organization_id IS NULL
             )
         AND permission_id IN (
               SELECT id FROM permissions WHERE (resource = 'webhook' AND action = 'read')
                  OR (resource = 'api-key' AND action = 'read')
             )
    `);

    // ── C. Fix missing Member grants (flat delete actions — service enforces ownership) ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Member'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'comment'  AND p.action = 'delete')
            OR (p.resource = 'worklog'  AND p.action = 'delete')
            OR (p.resource = 'page'     AND p.action = 'delete')
         )
      ON CONFLICT DO NOTHING
    `);

    // ── D. Grant :own/:any granular permissions ───────────────────────────────
    // Member: :own variants for comment/worklog/page
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Member'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'comment' AND p.action IN ('update:own', 'delete:own'))
            OR (p.resource = 'worklog' AND p.action IN ('update:own', 'delete:own'))
            OR (p.resource = 'page'    AND p.action = 'delete:own')
         )
      ON CONFLICT DO NOTHING
    `);

    // Admin: :any variants (can edit/delete anyone's content)
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Admin'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'comment' AND p.action IN ('update:own', 'update:any', 'delete:own', 'delete:any'))
            OR (p.resource = 'worklog' AND p.action IN ('update:own', 'update:any', 'delete:own', 'delete:any'))
            OR (p.resource = 'page'    AND p.action IN ('delete:own', 'delete:any'))
         )
      ON CONFLICT DO NOTHING
    `);

    // Owner: :any variants (full access)
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Owner'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'comment' AND p.action IN ('update:own', 'update:any', 'delete:own', 'delete:any'))
            OR (p.resource = 'worklog' AND p.action IN ('update:own', 'update:any', 'delete:own', 'delete:any'))
            OR (p.resource = 'page'    AND p.action IN ('delete:own', 'delete:any'))
         )
      ON CONFLICT DO NOTHING
    `);

    // ── E. Grant new permissions per CSV matrix ───────────────────────────────

    // Owner + Admin: all new permissions
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name IN ('Owner', 'Admin')
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND p.resource IN (
               'project', 'workflow', 'dev-tools', 'issue', 'voter',
               'watcher', 'archive', 'attachment', 'users'
             )
         AND p.action IN (
               'extended-admin',
               'read', 'assignable', 'transition', 'resolve', 'close',
               'link', 'schedule', 'move', 'modify-reporter', 'set-security',
               'bulk-change', 'vote', 'archive', 'restore',
               'read:project', 'read:all',
               'create', 'delete:own', 'delete:any',
               'add-self', 'manage', 'browse'
             )
      ON CONFLICT DO NOTHING
    `);

    // Member: permitted new actions per CSV
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Member'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'workflow'    AND p.action = 'read')
            OR (p.resource = 'dev-tools'   AND p.action = 'read')
            OR (p.resource = 'issue'       AND p.action IN ('assignable', 'transition', 'resolve', 'close', 'link', 'schedule', 'bulk-change', 'vote'))
            OR (p.resource = 'voter'       AND p.action = 'read')
            OR (p.resource = 'watcher'     AND p.action IN ('add-self', 'manage', 'read'))
            OR (p.resource = 'archive'     AND p.action = 'read:project')
            OR (p.resource = 'attachment'  AND p.action IN ('read', 'create', 'delete:own'))
            OR (p.resource = 'users'       AND p.action = 'browse')
         )
      ON CONFLICT DO NOTHING
    `);

    // Viewer: read-only new permissions
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name            = 'Viewer'
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'workflow'   AND p.action = 'read')
            OR (p.resource = 'dev-tools'  AND p.action = 'read')
            OR (p.resource = 'issue'      AND p.action IN ('assignable', 'vote'))
            OR (p.resource = 'voter'      AND p.action = 'read')
            OR (p.resource = 'watcher'    AND p.action IN ('add-self', 'read'))
            OR (p.resource = 'archive'    AND p.action = 'read:project')
            OR (p.resource = 'attachment' AND p.action = 'read')
            OR (p.resource = 'users'      AND p.action = 'browse')
         )
      ON CONFLICT DO NOTHING
    `);

    // Grant Owner all newly-seeded permissions via blanket insert (catches
    // anything missed by the targeted statements above).
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
    // Revoke all new permissions from all system roles.
    await queryRunner.query(`
      DELETE FROM role_permissions
       WHERE permission_id IN (
         SELECT id FROM permissions WHERE resource IN (
           'workflow', 'dev-tools', 'voter', 'watcher', 'archive', 'attachment', 'users'
         )
         UNION ALL
         SELECT id FROM permissions WHERE resource = 'project' AND action = 'extended-admin'
         UNION ALL
         SELECT id FROM permissions WHERE resource = 'issue'   AND action IN (
           'assignable', 'transition', 'resolve', 'close', 'link', 'schedule',
           'move', 'modify-reporter', 'set-security', 'bulk-change', 'vote', 'archive', 'restore'
         )
         UNION ALL
         SELECT id FROM permissions WHERE resource IN ('comment','worklog','page')
           AND action IN ('update:own','update:any','delete:own','delete:any')
       )
    `);

    // Delete the new permission rows.
    await queryRunner.query(`
      DELETE FROM permissions WHERE resource IN (
        'workflow', 'dev-tools', 'voter', 'watcher', 'archive', 'attachment', 'users'
      )
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE resource = 'project' AND action = 'extended-admin'
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE resource = 'issue' AND action IN (
        'assignable', 'transition', 'resolve', 'close', 'link', 'schedule',
        'move', 'modify-reporter', 'set-security', 'bulk-change', 'vote', 'archive', 'restore'
      )
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE resource IN ('comment', 'worklog', 'page')
        AND action IN ('update:own', 'update:any', 'delete:own', 'delete:any')
    `);

    // Re-grant webhook:read and api-key:read to Member and Viewer
    // (restoring the original SeedData state).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
       WHERE r.name IN ('Member', 'Viewer')
         AND r.is_system       IS TRUE
         AND r.organization_id IS NULL
         AND (
               (p.resource = 'webhook'  AND p.action = 'read')
            OR (p.resource = 'api-key'  AND p.action = 'read')
         )
      ON CONFLICT DO NOTHING
    `);

    // Remove comment:delete, worklog:delete, page:delete from Member
    // (restoring the original SeedData omission).
    await queryRunner.query(`
      DELETE FROM role_permissions
       WHERE role_id  IN (SELECT id FROM roles WHERE name = 'Member' AND is_system = TRUE AND organization_id IS NULL)
         AND permission_id IN (
               SELECT id FROM permissions WHERE resource = 'comment' AND action = 'delete'
               UNION ALL
               SELECT id FROM permissions WHERE resource = 'worklog' AND action = 'delete'
               UNION ALL
               SELECT id FROM permissions WHERE resource = 'page'    AND action = 'delete'
             )
    `);
  }
}
