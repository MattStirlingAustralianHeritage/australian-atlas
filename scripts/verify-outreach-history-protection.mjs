#!/usr/bin/env node
/**
 * Verify migration 258 (outreach contact history protection) end-to-end
 * against the live DB — inside transactions that ROLL BACK, so nothing
 * persists. Asserts:
 *   1. FK operator_outreach.listing_id is ON DELETE SET NULL, column nullable
 *   2. Deleting a listing: contacted row survives detached + stamped with
 *      listing_name/vertical/deleted_at; never-contacted row is pruned
 *   3. Direct DELETE of a contacted row raises
 *   4. SET LOCAL atlas.allow_outreach_history_delete = 'on' escape hatch works
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import url from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
function loadEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

const ref = 'nyhkcmvhwbydsqsyvizs'
const password = process.env.SUPABASE_DB_PASSWORD
if (!password) { console.error('Set SUPABASE_DB_PASSWORD in .env.local'); process.exit(1) }

const pool = new pg.Pool({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

let failures = 0
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const client = await pool.connect()
  const tag = crypto.randomBytes(4).toString('hex')
  try {
    // ── 1. Schema assertions (no txn needed) ──────────────────
    const { rows: fk } = await client.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'operator_outreach'::regclass AND contype = 'f'
        AND confrelid = 'listings'::regclass`)
    check('FK is ON DELETE SET NULL', fk.length === 1 && fk[0].confdeltype === 'n', `confdeltype=${fk[0]?.confdeltype}`)

    const { rows: nn } = await client.query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'operator_outreach' AND column_name = 'listing_id'`)
    check('listing_id nullable', nn[0]?.is_nullable === 'YES')

    const { rows: trg } = await client.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgname IN ('trg_preserve_outreach_on_listing_delete', 'trg_protect_outreach_contact_history')
        AND NOT tgisinternal`)
    check('both triggers installed', trg.length === 2, trg.map((t) => t.tgname).join(', '))

    const { rows: newCols } = await client.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'operator_outreach'
        AND column_name IN ('listing_name', 'listing_vertical', 'listing_deleted_at')`)
    check('denormalized columns present', newCols[0].n === 3)

    // ── 2. Behavioral test in a rolled-back txn ───────────────
    await client.query('BEGIN')
    try {
      const { rows: lrows } = await client.query(
        `INSERT INTO listings (name, slug, vertical, source_id, state, status, is_claimed)
         VALUES ($1, $2, 'craft', $3, 'VIC', 'active', false) RETURNING id, name, vertical`,
        [`ZZ Test Outreach History ${tag}`, `zz-test-outreach-history-${tag}`, `zz-test-${tag}`])
      const listing = lrows[0]

      const { rows: contacted } = await client.query(
        `INSERT INTO operator_outreach (listing_id, contact_email, status, send_status, sent_at, last_contacted_at, campaign_id)
         VALUES ($1, $2, 'contacted', 'sent', now(), now(), 'cmp_test_${tag}') RETURNING id`,
        [listing.id, `zz-test-contacted-${tag}@example.com`])
      const { rows: untouched } = await client.query(
        `INSERT INTO operator_outreach (listing_id, contact_email, status, discovered_at)
         VALUES ($1, $2, 'not_contacted', now()) RETURNING id`,
        [listing.id, `zz-test-untouched-${tag}@example.com`])

      await client.query(`DELETE FROM listings WHERE id = $1`, [listing.id])

      const { rows: after } = await client.query(
        `SELECT id, listing_id, listing_name, listing_vertical, listing_deleted_at
         FROM operator_outreach WHERE id = ANY($1::bigint[])`,
        [[contacted[0].id, untouched[0].id]])
      const survivor = after.find((r) => r.id === contacted[0].id)
      const pruned = after.find((r) => r.id === untouched[0].id)

      check('contacted row survives listing delete', !!survivor)
      check('…detached (listing_id NULL)', survivor?.listing_id === null)
      check('…stamped with listing_name', survivor?.listing_name === listing.name, survivor?.listing_name)
      check('…stamped with listing_vertical', survivor?.listing_vertical === listing.vertical)
      check('…stamped with listing_deleted_at', !!survivor?.listing_deleted_at)
      check('never-contacted row pruned', !pruned)

      // 3. Direct delete of contact history must raise.
      await client.query(`SAVEPOINT direct_delete`)
      let raised = false
      try {
        await client.query(`DELETE FROM operator_outreach WHERE id = $1`, [contacted[0].id])
      } catch (err) {
        raised = /contact history/.test(err.message)
      }
      await client.query(`ROLLBACK TO SAVEPOINT direct_delete`)
      check('direct DELETE of contacted row raises', raised)

      // 4. Escape hatch.
      await client.query(`SET LOCAL atlas.allow_outreach_history_delete = 'on'`)
      const { rowCount } = await client.query(`DELETE FROM operator_outreach WHERE id = $1`, [contacted[0].id])
      check('escape hatch allows deliberate erasure', rowCount === 1)
    } finally {
      await client.query('ROLLBACK')
    }

    // Residue check — nothing from this run may persist.
    const { rows: residue } = await client.query(
      `SELECT count(*)::int AS n FROM operator_outreach WHERE contact_email LIKE $1`, [`zz-test-%-${tag}@example.com`])
    const { rows: residueL } = await client.query(
      `SELECT count(*)::int AS n FROM listings WHERE slug = $1`, [`zz-test-outreach-history-${tag}`])
    check('zero residue after rollback', residue[0].n === 0 && residueL[0].n === 0)

    console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.')
    process.exitCode = failures ? 1 : 0
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1) })
