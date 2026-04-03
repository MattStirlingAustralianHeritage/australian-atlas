#!/usr/bin/env node
/**
 * Run a SQL migration against the master Supabase DB.
 * Usage: node --env-file=.env.local scripts/run-migration.mjs <migration-file>
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const ref = 'nyhkcmvhwbydsqsyvizs'
const password = process.env.SUPABASE_DB_PASSWORD

if (!password) {
  console.log('Set SUPABASE_DB_PASSWORD in .env.local')
  process.exit(1)
}

const file = process.argv[2]
if (!file) {
  console.log('Usage: node --env-file=.env.local scripts/run-migration.mjs <path/to/migration.sql>')
  process.exit(1)
}

const sql = fs.readFileSync(path.resolve(file), 'utf-8')

const pool = new pg.Pool({
  connectionString: `postgresql://postgres.${ref}:${password}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`,
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
