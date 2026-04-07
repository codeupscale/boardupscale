#!/usr/bin/env node

/**
 * Repair script: Fix stolen organization memberships
 *
 * Problem: Saman (and possibly Rohail) were moved from their original org
 * to a new org during an invite/join flow, losing their ownership of the
 * original org.
 *
 * This script:
 * 1. Creates organization_members entries for multi-org membership
 * 2. Restores Saman's user record to her original org as owner
 * 3. Checks and repairs Rohail if similarly affected
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/repair-stolen-memberships.js
 *
 * Or via docker:
 *   docker exec -t infra-bu-api-1 node -e "$(cat scripts/repair-stolen-memberships.js)"
 *
 * DO NOT run without reviewing the dry-run output first.
 */

const { Client } = require('pg')

const SAMAN_USER_ID = '29ed2426-d13e-4923-83b8-9ee74579ce61'
const SAMAN_EMAIL = 'saman.zulfiqar@codeupscale.com'
const SAMAN_ORIGINAL_ORG = '32c8b99b' // partial UUID prefix — will be matched
const SAMAN_NEW_ORG = 'c2e15f51' // partial UUID prefix — will be matched

const ROHAIL_EMAIL = 'rohail.butt@codeupscale.com'

const DRY_RUN = process.env.DRY_RUN !== 'false'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const client = new Client({ connectionString })
  await client.connect()

  console.log(`\n=== Repair Stolen Memberships ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (set DRY_RUN=false to execute)' : 'LIVE — changes will be committed'}\n`)

  try {
    await client.query('BEGIN')

    // ─── Step 1: Look up Saman ────────────────────────────────────────
    console.log('--- Step 1: Look up Saman ---')
    const samanResult = await client.query(
      `SELECT id, email, display_name, organization_id, role FROM users WHERE id = $1 OR email = $2`,
      [SAMAN_USER_ID, SAMAN_EMAIL],
    )
    if (samanResult.rows.length === 0) {
      console.error('ERROR: Saman not found in users table')
      await client.query('ROLLBACK')
      process.exit(1)
    }
    const saman = samanResult.rows[0]
    console.log(`Found Saman: ${saman.display_name} (${saman.email})`)
    console.log(`  Current org: ${saman.organization_id}`)
    console.log(`  Current role: ${saman.role}`)

    // ─── Step 2: Resolve full org UUIDs ───────────────────────────────
    console.log('\n--- Step 2: Resolve organization IDs ---')
    const orgsResult = await client.query(
      `SELECT id, name, slug FROM organizations WHERE id::text LIKE $1 OR id::text LIKE $2`,
      [`${SAMAN_ORIGINAL_ORG}%`, `${SAMAN_NEW_ORG}%`],
    )
    const orgMap = {}
    for (const org of orgsResult.rows) {
      console.log(`  Org: ${org.name} (${org.id})`)
      if (org.id.startsWith(SAMAN_ORIGINAL_ORG)) orgMap.original = org
      if (org.id.startsWith(SAMAN_NEW_ORG)) orgMap.new = org
    }
    if (!orgMap.original || !orgMap.new) {
      console.error('ERROR: Could not resolve both organization IDs')
      console.error('  Original org prefix:', SAMAN_ORIGINAL_ORG, '→', orgMap.original?.id || 'NOT FOUND')
      console.error('  New org prefix:', SAMAN_NEW_ORG, '→', orgMap.new?.id || 'NOT FOUND')
      await client.query('ROLLBACK')
      process.exit(1)
    }

    // ─── Step 3: Check existing memberships for Saman ─────────────────
    console.log('\n--- Step 3: Check existing memberships ---')
    const existingMemberships = await client.query(
      `SELECT id, organization_id, role, is_default FROM organization_members WHERE user_id = $1`,
      [saman.id],
    )
    console.log(`  Saman has ${existingMemberships.rows.length} existing membership(s):`)
    for (const m of existingMemberships.rows) {
      console.log(`    org=${m.organization_id} role=${m.role} is_default=${m.is_default}`)
    }

    const existingOrgIds = new Set(existingMemberships.rows.map((m) => m.organization_id))

    // ─── Step 4: Create missing memberships for Saman ─────────────────
    console.log('\n--- Step 4: Create Saman memberships ---')

    // Membership for original org (owner, default)
    if (!existingOrgIds.has(orgMap.original.id)) {
      console.log(`  INSERT membership: Saman → ${orgMap.original.name} (owner, is_default=true)`)
      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO organization_members (user_id, organization_id, role, is_default)
           VALUES ($1, $2, 'owner', true)
           ON CONFLICT (user_id, organization_id) DO NOTHING`,
          [saman.id, orgMap.original.id],
        )
      }
    } else {
      console.log(`  Membership for original org already exists — updating to owner/default`)
      if (!DRY_RUN) {
        await client.query(
          `UPDATE organization_members SET role = 'owner', is_default = true
           WHERE user_id = $1 AND organization_id = $2`,
          [saman.id, orgMap.original.id],
        )
      }
    }

    // Membership for new org (member, not default)
    if (!existingOrgIds.has(orgMap.new.id)) {
      console.log(`  INSERT membership: Saman → ${orgMap.new.name} (member, is_default=false)`)
      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO organization_members (user_id, organization_id, role, is_default)
           VALUES ($1, $2, 'member', false)
           ON CONFLICT (user_id, organization_id) DO NOTHING`,
          [saman.id, orgMap.new.id],
        )
      }
    } else {
      console.log(`  Membership for new org already exists — updating to member/non-default`)
      if (!DRY_RUN) {
        await client.query(
          `UPDATE organization_members SET role = 'member', is_default = false
           WHERE user_id = $1 AND organization_id = $2`,
          [saman.id, orgMap.new.id],
        )
      }
    }

    // ─── Step 5: Restore Saman's user record ──────────────────────────
    console.log('\n--- Step 5: Restore Saman user record ---')
    console.log(`  UPDATE users SET organization_id = '${orgMap.original.id}', role = 'owner' WHERE id = '${saman.id}'`)
    if (!DRY_RUN) {
      await client.query(
        `UPDATE users SET organization_id = $1, role = 'owner' WHERE id = $2`,
        [orgMap.original.id, saman.id],
      )
    }

    // ─── Step 6: Check Rohail ─────────────────────────────────────────
    console.log('\n--- Step 6: Check Rohail ---')
    const rohailResult = await client.query(
      `SELECT id, email, display_name, organization_id, role FROM users WHERE email = $1`,
      [ROHAIL_EMAIL],
    )
    if (rohailResult.rows.length === 0) {
      console.log('  Rohail not found in users table — skipping')
    } else {
      const rohail = rohailResult.rows[0]
      console.log(`  Found Rohail: ${rohail.display_name} (${rohail.email})`)
      console.log(`    Current org: ${rohail.organization_id}`)
      console.log(`    Current role: ${rohail.role}`)

      // Check if Rohail was also stolen (is in the new org but should be in original)
      const rohailInNewOrg = rohail.organization_id === orgMap.new.id
      const rohailInOriginalOrg = rohail.organization_id === orgMap.original.id

      if (rohailInNewOrg) {
        console.log('  Rohail appears to have been stolen to the new org!')

        // Check existing memberships
        const rohailMemberships = await client.query(
          `SELECT id, organization_id, role, is_default FROM organization_members WHERE user_id = $1`,
          [rohail.id],
        )
        console.log(`  Rohail has ${rohailMemberships.rows.length} existing membership(s)`)
        const rohailOrgIds = new Set(rohailMemberships.rows.map((m) => m.organization_id))

        // Determine Rohail's original org — check if they owned any org
        const rohailOwnedOrgs = await client.query(
          `SELECT id, name FROM organizations WHERE owner_id = $1`,
          [rohail.id],
        )
        const rohailOriginalOrg = rohailOwnedOrgs.rows.length > 0 ? rohailOwnedOrgs.rows[0] : null

        if (rohailOriginalOrg) {
          console.log(`  Rohail owned org: ${rohailOriginalOrg.name} (${rohailOriginalOrg.id})`)

          // Create membership for their original org
          if (!rohailOrgIds.has(rohailOriginalOrg.id)) {
            console.log(`  INSERT membership: Rohail → ${rohailOriginalOrg.name} (owner, is_default=true)`)
            if (!DRY_RUN) {
              await client.query(
                `INSERT INTO organization_members (user_id, organization_id, role, is_default)
                 VALUES ($1, $2, 'owner', true)
                 ON CONFLICT (user_id, organization_id) DO NOTHING`,
                [rohail.id, rohailOriginalOrg.id],
              )
            }
          }

          // Create membership for new org
          if (!rohailOrgIds.has(orgMap.new.id)) {
            console.log(`  INSERT membership: Rohail → ${orgMap.new.name} (member, is_default=false)`)
            if (!DRY_RUN) {
              await client.query(
                `INSERT INTO organization_members (user_id, organization_id, role, is_default)
                 VALUES ($1, $2, 'member', false)
                 ON CONFLICT (user_id, organization_id) DO NOTHING`,
                [rohail.id, orgMap.new.id],
              )
            }
          }

          // Restore user record
          console.log(`  UPDATE users SET organization_id = '${rohailOriginalOrg.id}', role = 'owner' WHERE id = '${rohail.id}'`)
          if (!DRY_RUN) {
            await client.query(
              `UPDATE users SET organization_id = $1, role = 'owner' WHERE id = $2`,
              [rohailOriginalOrg.id, rohail.id],
            )
          }
        } else {
          console.log('  Rohail does not own any org — creating memberships for both orgs as member')

          // Create membership for original org (32c8b99b)
          if (!rohailOrgIds.has(orgMap.original.id)) {
            console.log(`  INSERT membership: Rohail → ${orgMap.original.name} (member, is_default=true)`)
            if (!DRY_RUN) {
              await client.query(
                `INSERT INTO organization_members (user_id, organization_id, role, is_default)
                 VALUES ($1, $2, 'member', true)
                 ON CONFLICT (user_id, organization_id) DO NOTHING`,
                [rohail.id, orgMap.original.id],
              )
            }
          }

          if (!rohailOrgIds.has(orgMap.new.id)) {
            console.log(`  INSERT membership: Rohail → ${orgMap.new.name} (member, is_default=false)`)
            if (!DRY_RUN) {
              await client.query(
                `INSERT INTO organization_members (user_id, organization_id, role, is_default)
                 VALUES ($1, $2, 'member', false)
                 ON CONFLICT (user_id, organization_id) DO NOTHING`,
                [rohail.id, orgMap.new.id],
              )
            }
          }

          // Restore to original org
          console.log(`  UPDATE users SET organization_id = '${orgMap.original.id}' WHERE id = '${rohail.id}'`)
          if (!DRY_RUN) {
            await client.query(
              `UPDATE users SET organization_id = $1 WHERE id = $2`,
              [orgMap.original.id, rohail.id],
            )
          }
        }
      } else if (rohailInOriginalOrg) {
        console.log('  Rohail is in the original org — not stolen. Checking memberships...')
        const rohailMemberships = await client.query(
          `SELECT id, organization_id, role, is_default FROM organization_members WHERE user_id = $1`,
          [rohail.id],
        )
        if (rohailMemberships.rows.length === 0) {
          console.log('  No membership rows — creating one for current org')
          if (!DRY_RUN) {
            await client.query(
              `INSERT INTO organization_members (user_id, organization_id, role, is_default)
               VALUES ($1, $2, $3, true)
               ON CONFLICT (user_id, organization_id) DO NOTHING`,
              [rohail.id, rohail.organization_id, rohail.role],
            )
          }
        } else {
          console.log('  Rohail has membership rows — no repair needed')
        }
      } else {
        console.log(`  Rohail is in a different org (${rohail.organization_id}) — manual review needed`)
      }
    }

    // ─── Step 7: Verify ───────────────────────────────────────────────
    console.log('\n--- Step 7: Verification ---')
    if (!DRY_RUN) {
      const verifySaman = await client.query(
        `SELECT u.id, u.email, u.organization_id, u.role,
                (SELECT json_agg(json_build_object('org_id', om.organization_id, 'role', om.role, 'is_default', om.is_default))
                 FROM organization_members om WHERE om.user_id = u.id) as memberships
         FROM users u WHERE u.id = $1`,
        [saman.id],
      )
      console.log('Saman after repair:', JSON.stringify(verifySaman.rows[0], null, 2))

      if (rohailResult.rows.length > 0) {
        const verifyRohail = await client.query(
          `SELECT u.id, u.email, u.organization_id, u.role,
                  (SELECT json_agg(json_build_object('org_id', om.organization_id, 'role', om.role, 'is_default', om.is_default))
                   FROM organization_members om WHERE om.user_id = u.id) as memberships
           FROM users u WHERE u.email = $1`,
          [ROHAIL_EMAIL],
        )
        if (verifyRohail.rows.length > 0) {
          console.log('Rohail after repair:', JSON.stringify(verifyRohail.rows[0], null, 2))
        }
      }

      await client.query('COMMIT')
      console.log('\n=== COMMITTED SUCCESSFULLY ===')
    } else {
      await client.query('ROLLBACK')
      console.log('\n=== DRY RUN COMPLETE — no changes made ===')
      console.log('Set DRY_RUN=false to execute for real')
    }
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\nERROR — rolled back all changes:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
