// Concern 1: insert the Mount Lofty Estate commercial_groups entry.
// Idempotent (ON CONFLICT (group_name) DO NOTHING). Reads it back to confirm.
//   node scripts/mount-lofty/01-insert-group.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv, pgConnect, DOMAINS, REPO } from './_lib.mjs'

const env = loadEnv()
const client = await pgConnect(env)

const sql = readFileSync(resolve(REPO, 'supabase/migrations/259_mount_lofty_estate_commercial_group.sql'), 'utf8')
const res = await client.query(sql)
console.log(`INSERT rowCount: ${res.rowCount} (0 = already existed, 1 = inserted)`)

const { rows } = await client.query(
  `SELECT id, group_name, category, brands, brands_json, domains, vertical_scope,
          verify_case_by_case, parent_entity, source, notes
     FROM commercial_groups WHERE group_name = 'Mount Lofty Estate';`,
)
console.log('\n=== stored row ===')
console.log(JSON.stringify(rows[0], null, 2))

const stored = new Set(rows[0]?.domains || [])
const missing = DOMAINS.filter(d => !stored.has(d))
console.log('\nall five domains present:', missing.length === 0, missing.length ? `MISSING: ${missing}` : '')

await client.end()
