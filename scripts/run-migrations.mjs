#!/usr/bin/env node
/**
 * Apply SQL migration files to the portal DB over the Session pooler.
 * Connection comes from process.env.DATABASE_URL (no hardcoded secrets).
 * Each file runs in its own transaction; a failure rolls back that file and stops.
 *
 * Usage: node --env-file=.env.local scripts/run-migrations.mjs <file.sql> [<file.sql> ...]
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'

const files = process.argv.slice(2)
if (!files.length) { console.error('No migration files given'); process.exit(2) }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(2) }

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
})

await client.connect()
let failed = false
for (const file of files) {
  const sql = readFileSync(file, 'utf8')
  process.stdout.write(`Applying ${file} ... `)
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('commit')
    console.log('OK')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    console.log('FAILED')
    console.error(`  ${err.code || ''} ${err.message}`)
    failed = true
    break
  }
}
await client.end()
process.exit(failed ? 1 : 0)
