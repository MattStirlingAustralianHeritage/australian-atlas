#!/usr/bin/env node
/**
 * Run a SQL migration against the master Supabase DB.
 *
 * Usage: node scripts/run-migration.mjs <migration-file>
 *
 * Env vars (SUPABASE_DB_PASSWORD) are loaded automatically from
 * ./.env.local via the inline-regex parser used elsewhere in scripts/
 * (Node's built-in --env-file parser fails on this project's .env.local —
 * see commit fd7fb52 for context).
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import url from 'url'

// ── Env loading (matches scripts/pitch-generate.mjs / scripts/_check_*.mjs) ──

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

const ref = 'nyhkcmvhwbydsqsyvizs'
const password = process.env.SUPABASE_DB_PASSWORD

if (!password) {
  console.log('Set SUPABASE_DB_PASSWORD in .env.local')
  process.exit(1)
}

const file = process.argv[2]
if (!file) {
  console.log('Usage: node scripts/run-migration.mjs <path/to/migration.sql>')
  process.exit(1)
}

const sql = fs.readFileSync(path.resolve(file), 'utf-8')

const pool = new pg.Pool({
  // Pooler region: ap-northeast-1 (Tokyo). `aws-1`, NOT `aws-0`.
  //
  // Port 5432 = SESSION pooler. Required for migrations because it
  // supports prepared statements, multi-statement transactions, and DDL
  // cleanly. The transaction pooler at 6543 returns 28P01 on this
  // project's session-pooler-only configuration — which masquerades as
  // a password failure but is actually a pooler-mode mismatch.
  // Confirmed via the Supabase Connect panel 2026-05-22.
  //
  // Username format `postgres.<project-ref>` is the tenant-scoped form
  // required by the pooler (vs bare `postgres` for direct connections).
  //
  // Password is encodeURIComponent'd defensively against future rotations
  // that may pick characters like @ : / ? # % & which would otherwise
  // corrupt the connection string.
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  const client = await pool.connect()
  try {
    console.log(`Running migration: ${file}`)
    await client.query(sql)
    console.log('Migration complete.')
  } catch (err) {
    console.error('Migration error:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
