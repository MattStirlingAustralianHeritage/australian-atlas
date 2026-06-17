// Integration test for migration 173 — tightens the `regions` read policy.
//
// Runs the REAL migration SQL (read from disk) against an in-process Postgres
// (PGlite) so the policy is exercised exactly as written, not a paraphrase.
// Mirrors lib/operator-intake/operator-intake-rls.test.mjs. PGlite is
// intentionally NOT a repo dependency (it would disturb the lockfile), so this
// imports it from process.env.PGLITE_MODULE and skips cleanly when absent.
// Run it with, e.g.:
//
//   PGLITE_MODULE=/abs/path/to/node_modules/@electric-sql/pglite/dist/index.js \
//     node --test lib/regions/regions-rls.test.mjs
//
// What it proves:
//   • BEFORE (the bug): with the pre-existing `using ((status='live') OR true)`
//     policy that migration 171 left in place, the anon role reads BOTH live
//     and draft regions.
//   • AFTER (the fix): the migration's `using (status='live')` policy lets anon
//     and authenticated read ONLY live regions; draft rows become invisible.
//   • service_role still reads every row (BYPASSRLS) — the app is unaffected.
//   • The recreated policy predicate no longer contains the `OR true` escape.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATION_SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '173_regions_rls_live_only.sql'),
  'utf8',
)

// Try to load PGlite from the env-pointed install; skip the suite if unavailable.
let PGlite = null
try {
  ;({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'))
} catch {
  /* not installed in this environment — suite skips below */
}

// Minimal stand-in for the prod `regions` table — only the columns the policy
// and this test touch. In real Supabase the table and the default anon/
// authenticated/service_role grants already exist; here we stand up just enough
// that RLS — not a missing GRANT — is what gates the reads. The policy created
// here reproduces the PRE-EXISTING (vulnerable) state that migration 171 left:
// RLS on, but a read policy whose predicate is short-circuited to TRUE.
const SETUP_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create table regions (
    id uuid primary key default gen_random_uuid(),
    slug text unique,
    name text,
    status text not null default 'draft'
  );

  grant usage on schema public to anon, authenticated, service_role;
  grant select on regions to anon, authenticated;
  grant all on regions to service_role;

  alter table regions enable row level security;
  create policy "Public can read live regions" on regions
    for select to public
    using ((status = 'live') or true);
`

const LIVE = '11111111-1111-1111-1111-111111111111'
const DRAFT = '22222222-2222-2222-2222-222222222222'

// Seeded one statement at a time; a parameterized db.query is a single prepared
// statement and cannot carry multiple ;-separated commands.
async function seed(db) {
  await db.query(
    `insert into regions (id, slug, name, status) values
       ($1, 'adelaide-hills', 'Adelaide Hills', 'live'),
       ($2, 'bruny-island',   'Bruny Island',   'draft')`,
    [LIVE, DRAFT],
  )
}

describe('migration 173 — regions read policy is live-only for anon/authenticated', {
  skip: PGlite ? false : 'PGlite unavailable — set PGLITE_MODULE to an @electric-sql/pglite build to run',
}, () => {
  let db

  // Run a body under a given Postgres role (RLS applies to non-superuser roles;
  // the default PGlite session user bypasses it, hence the explicit set role).
  async function asRole(role, fn) {
    await db.exec(`set role ${role}`)
    try { return await fn() } finally { await db.exec('reset role') }
  }

  // The region slugs visible to a given role, sorted for a stable compare.
  async function visibleSlugs(role) {
    return asRole(role, async () => {
      const r = await db.query(`select slug from regions order by slug`)
      return r.rows.map((x) => x.slug)
    })
  }

  before(async () => {
    db = new PGlite()
    await db.exec(SETUP_SQL)
    await seed(db)
  })

  after(async () => { if (db) await db.close() })

  test('BEFORE the migration: the OR-true policy leaks draft regions to anon', async () => {
    assert.deepEqual(
      await visibleSlugs('anon'),
      ['adelaide-hills', 'bruny-island'],
      'anon sees BOTH the live and the draft region (the vulnerability)',
    )
  })

  test('apply migration 173 (the real SQL from disk)', async () => {
    await db.exec(MIGRATION_SQL)
    // The recreated policy predicate must no longer contain the always-true escape.
    const qual = (await db.query(
      `select qual from pg_policies
         where schemaname='public' and tablename='regions'
           and policyname='Public can read live regions'`,
    )).rows[0]?.qual
    assert.ok(qual, 'policy still exists after the migration')
    assert.match(qual, /status = 'live'/, 'predicate checks status = live')
    assert.doesNotMatch(qual, /\btrue\b/i, 'predicate no longer has an OR true escape hatch')
  })

  test('AFTER the migration: anon reads only the LIVE region', async () => {
    assert.deepEqual(
      await visibleSlugs('anon'),
      ['adelaide-hills'],
      'the draft region is no longer visible to anon',
    )
  })

  test('AFTER the migration: authenticated also reads only the LIVE region', async () => {
    assert.deepEqual(
      await visibleSlugs('authenticated'),
      ['adelaide-hills'],
      'the draft region is no longer visible to authenticated',
    )
  })

  test('AFTER the migration: service_role still sees every region (BYPASSRLS)', async () => {
    assert.deepEqual(
      await visibleSlugs('service_role'),
      ['adelaide-hills', 'bruny-island'],
      'the service role the app uses is unaffected by RLS',
    )
  })
})
