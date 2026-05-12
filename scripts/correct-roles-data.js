#!/usr/bin/env node
/**
 * correct-roles-data.js
 *
 * One-time data correction script for the org/project roles refactor.
 *
 * Reflects the cumulative state of ALL migrations up to and including
 * 1747700000000-AddIssueMovePermission. Safe to run against a live DB to repair
 * or verify role_permissions, or to backfill rows that slipped through migrations.
 *
 * What it does:
 *   1. Prints a dry-run report of affected rows.
 *   2. Backfills organization_members.role: admin/member/viewer → user.
 *   3. Backfills users.role: admin/member/viewer/manager/developer → user.
 *   4. Backfills project_members.role: developer/user/manager → member  (viewer stays as-is).
 *   5. Rebuilds role_permissions for all system roles (Owner/Administrator/User/Admin/Member/Viewer).
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/dbname node scripts/correct-roles-data.js
 *   DATABASE_URL=... DRY_RUN=false node scripts/correct-roles-data.js   # apply changes
 *
 * Docker:
 *   docker exec -t <api-container> sh -c "DATABASE_URL=\$DATABASE_URL node /app/scripts/correct-roles-data.js"
 */

const { Client } = require('pg')

const DRY_RUN = process.env.DRY_RUN !== 'false'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const client = new Client({ connectionString })
  await client.connect()
  console.log(`\n🔍 Connected. DRY_RUN=${DRY_RUN}\n`)

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // DRY-RUN REPORT
    // ─────────────────────────────────────────────────────────────────────────

    const orgMemberAffected = await client.query(`
      SELECT role, COUNT(*) AS count
        FROM organization_members
       WHERE role IN ('admin', 'member', 'viewer')
       GROUP BY role
       ORDER BY role
    `)
    console.log('organization_members rows to remap → user:')
    if (orgMemberAffected.rows.length === 0) {
      console.log('  (none — already clean)')
    } else {
      orgMemberAffected.rows.forEach((r) => console.log(`  ${r.role}: ${r.count}`))
    }

    const userAffected = await client.query(`
      SELECT role, COUNT(*) AS count
        FROM users
       WHERE role IN ('admin', 'member', 'viewer', 'manager', 'developer')
       GROUP BY role
       ORDER BY role
    `)
    console.log('\nusers rows to remap → user:')
    if (userAffected.rows.length === 0) {
      console.log('  (none — already clean)')
    } else {
      userAffected.rows.forEach((r) => console.log(`  ${r.role}: ${r.count}`))
    }

    const pmAffected = await client.query(`
      SELECT role, COUNT(*) AS count
        FROM project_members
       WHERE role IN ('developer', 'user', 'manager')
       GROUP BY role
       ORDER BY role
    `)
    console.log('\nproject_members rows to remap → member (viewer stays as-is):')
    if (pmAffected.rows.length === 0) {
      console.log('  (none — already clean)')
    } else {
      pmAffected.rows.forEach((r) => console.log(`  ${r.role}: ${r.count}`))
    }

    console.log('\n─────────────────────────────────────────────────────────')

    if (DRY_RUN) {
      console.log('\nDRY RUN complete. Run with DRY_RUN=false to apply changes.\n')
      return
    }

    // ─────────────────────────────────────────────────────────────────────────
    // APPLY CHANGES
    // ─────────────────────────────────────────────────────────────────────────
    await client.query('BEGIN')

    // 1. organization_members.role backfill
    const om = await client.query(`
      UPDATE organization_members
         SET role = 'user'
       WHERE role IN ('admin', 'member', 'viewer')
    `)
    console.log(`✅ organization_members updated: ${om.rowCount} rows → user`)

    // 2. users.role backfill
    const u = await client.query(`
      UPDATE users
         SET role = 'user'
       WHERE role IN ('admin', 'member', 'viewer', 'manager', 'developer')
    `)
    console.log(`✅ users updated: ${u.rowCount} rows → user`)

    // 3. project_members.role backfill  (viewer is a valid current role — do NOT remap it)
    const pm = await client.query(`
      UPDATE project_members
         SET role = 'member'
       WHERE role IN ('developer', 'user', 'manager')
    `)
    console.log(`✅ project_members updated: ${pm.rowCount} rows → member`)

    // 4. Rebuild system role_permissions ─────────────────────────────────────
    console.log('\nRebuilding system role_permissions...')

    // Wipe system role grants
    await client.query(`
      DELETE FROM role_permissions
       WHERE role_id IN (
         SELECT id FROM roles WHERE is_system = TRUE AND organization_id IS NULL
       )
    `)
    console.log('  Cleared existing system role grants')

    // Owner: all permissions
    const ownerGrant = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
       WHERE r.name = 'Owner' AND r.is_system = TRUE AND r.organization_id IS NULL
      ON CONFLICT DO NOTHING
    `)
    console.log(`  Owner: ${ownerGrant.rowCount} permissions granted`)

    // User: only AI + users:browse
    const userRoleGrant = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
       WHERE r.name = 'User' AND r.is_system = TRUE AND r.organization_id IS NULL
         AND (
               (p.resource = 'ai' AND p.action IN ('read', 'use', 'chat'))
            OR (p.resource = 'users' AND p.action = 'browse')
         )
      ON CONFLICT DO NOTHING
    `)
    console.log(`  User: ${userRoleGrant.rowCount} permissions granted`)

    // Admin (project): all permissions except ALL organization:* (those belong to org-scope roles only)
    const adminGrant = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
       WHERE r.name = 'Admin' AND r.is_system = TRUE AND r.organization_id IS NULL
         AND NOT (p.resource = 'organization')
      ON CONFLICT DO NOTHING
    `)
    console.log(`  Admin: ${adminGrant.rowCount} permissions granted`)

    // Administrator (org-scope): all org permissions except delete/transfer-ownership/manage-billing
    const administratorGrant = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
       WHERE r.name = 'Administrator' AND r.is_system = TRUE AND r.organization_id IS NULL
         AND p.resource = 'organization'
         AND p.action NOT IN ('delete', 'transfer-ownership', 'manage-billing')
      ON CONFLICT DO NOTHING
    `)
    // Also grant Administrator project:create (O18)
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
       WHERE r.name = 'Administrator' AND r.is_system = TRUE AND r.organization_id IS NULL
         AND p.resource = 'project' AND p.action = 'create'
      ON CONFLICT DO NOTHING
    `)
    console.log(`  Administrator: ${administratorGrant.rowCount} org permissions granted (+project:create)`)

    // Member (project): project content
    const memberGrant = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
       WHERE r.name = 'Member' AND r.is_system = TRUE AND r.organization_id IS NULL
         AND (
               (p.resource = 'project'       AND p.action IN ('read'))
            OR (p.resource = 'board'         AND p.action IN ('read', 'create'))
            OR (p.resource = 'sprint'        AND p.action IN ('read'))
            OR (p.resource = 'issue'         AND p.action IN ('create', 'read', 'update', 'assign',
                                                              'assignable', 'transition', 'resolve',
                                                              'close', 'link', 'schedule', 'bulk-change',
                                                              'vote', 'delete'))
            OR (p.resource = 'comment'       AND p.action IN ('create', 'read', 'update:own', 'delete:own'))
            OR (p.resource = 'worklog'       AND p.action IN ('create', 'read', 'update:own', 'delete:own'))
            OR (p.resource = 'page'          AND p.action IN ('create', 'read', 'update', 'delete:own'))
            OR (p.resource = 'member'        AND p.action = 'read')
            OR (p.resource = 'automation'    AND p.action = 'read')
            OR (p.resource = 'component'     AND p.action = 'read')
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
    `)
    console.log(`  Member: ${memberGrant.rowCount} permissions granted`)

    // Viewer (project): read-only
    const viewerGrant = await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r CROSS JOIN permissions p
       WHERE r.name = 'Viewer' AND r.is_system = TRUE AND r.organization_id IS NULL
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
    `)
    console.log(`  Viewer: ${viewerGrant.rowCount} permissions granted`)

    await client.query('COMMIT')
    console.log('\n✅ All changes committed successfully.\n')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n❌ Error — transaction rolled back:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
