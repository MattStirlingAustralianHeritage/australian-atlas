// Integration test for migration 141 — RLS + the full publish pipeline.
//
// Runs the REAL migration SQL (read from disk) against an in-process Postgres
// (PGlite) so the policies are exercised exactly as written, not a paraphrase.
// PGlite is intentionally NOT a repo dependency (it would disturb the lockfile),
// so this test imports it from process.env.PGLITE_MODULE and skips cleanly when
// that is absent. Run it with, e.g.:
//
//   PGLITE_MODULE=/abs/path/to/node_modules/@electric-sql/pglite/dist/index.js \
//     node --test lib/operator-intake/operator-intake-rls.test.mjs
//
// What it proves:
//   • Full path: operator saves facts → service role generates v1 → regenerates
//     v2 (v1 superseded) → admin approves an edited v2 → listings.description is
//     the approved text and data_source='operator_verified'.
//   • RLS: operator B cannot read or insert operator A's facts; operator A can
//     READ their drafts but an approve-style UPDATE is a silent no-op and an
//     INSERT is denied; and an operator cannot write listings.description.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATION_SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '141_operator_intake_descriptions.sql'),
  'utf8',
)

// Try to load PGlite from the env-pointed install; skip the suite if unavailable.
let PGlite = null
try {
  ;({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'))
} catch {
  /* not installed in this environment — suite skips below */
}

// Fixed actors and listing.
const A = '11111111-1111-1111-1111-111111111111' // operator who owns the listing
const B = '22222222-2222-2222-2222-222222222222' // a different operator
const L1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' // the claimed listing

// Minimal prerequisites the migration's FKs and helper reference. In real
// Supabase these tables (and the auth schema + default role grants) already
// exist; here we stand up only what migration 141 touches.
const SETUP_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid
  $$;

  create table profiles (id uuid primary key, email text);
  create table listings (
    id uuid primary key default gen_random_uuid(),
    name text, slug text, description text, data_source text
  );
  create table listing_claims (
    id uuid primary key default gen_random_uuid(),
    listing_id uuid not null,
    claimed_by uuid not null,
    status text not null default 'active'
  );
`

// Table privileges Supabase grants by default to anon/authenticated/service_role.
// We grant them here so RLS — not a missing GRANT — is what does the gating on
// the operator-writable tables. listings deliberately gets SELECT only for
// authenticated: an operator has no direct write surface to the published field.
const GRANTS_SQL = `
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant select on listings to authenticated;
  grant select, insert, update on operator_facts to authenticated;
  grant select, insert, update on operator_description_drafts to authenticated;
  grant all on listings, profiles, listing_claims, operator_facts, operator_description_drafts to service_role;
`

// Seeded one statement at a time: a parameterized db.query is a single prepared
// statement and cannot carry multiple ;-separated commands.
async function seed(db) {
  await db.query(`insert into profiles (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`, [A, B])
  await db.query(
    `insert into listings (id, name, slug, description, data_source)
     values ($1, 'Mister Bianco', 'mister-bianco', null, 'ai_generated')`,
    [L1],
  )
  await db.query(`insert into listing_claims (listing_id, claimed_by, status) values ($1, $2, 'active')`, [L1, A])
}

const GEN1 = 'A 1923 red-brick warehouse on Gertrude Street. Long shared lunches on Saturdays.'
const GEN2 = 'A 1923 red-brick warehouse on Gertrude Street. Six courses, one sitting, on Saturdays.'
const APPROVED_TEXT = GEN2 + ' (admin edit.)' // admin edits before approving → their text wins

describe('operator-intake migration 141 — RLS + full publish pipeline', {
  skip: PGlite ? false : 'PGlite unavailable — set PGLITE_MODULE to an @electric-sql/pglite build to run',
}, () => {
  let db
  const state = {}

  // Run a body under a given role with a given auth.uid() (session-scoped, so
  // writes persist across steps — the pipeline spans several "requests").
  async function asRole(role, sub, fn) {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [sub ? JSON.stringify({ sub }) : ''])
    await db.exec(`set role ${role}`)
    try {
      return await fn()
    } finally {
      await db.exec('reset role')
      await db.query(`select set_config('request.jwt.claims', '', false)`)
    }
  }
  const asOperator = (sub, fn) => asRole('authenticated', sub, fn)
  const asService = (fn) => asRole('service_role', null, fn)

  before(async () => {
    db = new PGlite()
    await db.exec(SETUP_SQL)
    await db.exec(MIGRATION_SQL)
    await db.exec(GRANTS_SQL)
    await seed(db)
  })

  after(async () => { if (db) await db.close() })

  test('operator A saves structured facts for a listing they own', async () => {
    const factsId = await asOperator(A, async () => {
      const r = await db.query(
        `insert into operator_facts (listing_id, submitted_by, building_description, what_you_book)
         values ($1, $2, $3, $4) returning id`,
        [L1, A, 'A 1923 red-brick warehouse on Gertrude Street, Fitzroy.', 'A long shared lunch, six courses, on Saturdays.'],
      )
      return r.rows[0].id
    })
    assert.ok(factsId, 'facts row created')
    state.factsId = factsId
  })

  test('operator B cannot read or insert facts for A\'s listing (RLS)', async () => {
    await asOperator(B, async () => {
      const seen = await db.query(`select count(*)::int n from operator_facts`)
      assert.equal(seen.rows[0].n, 0, 'B sees none of A\'s facts')

      await assert.rejects(
        () => db.query(
          `insert into operator_facts (listing_id, submitted_by, building_description, what_you_book)
           values ($1, $2, $3, $4)`,
          [L1, B, 'forged', 'forged'],
        ),
        (e) => e.code === '42501',
        'B\'s insert for A\'s listing is denied by the WITH CHECK policy',
      )
    })
  })

  test('service role generates draft v1, then regenerates v2 and supersedes v1', async () => {
    const facts = { building_description: 'A 1923 red-brick warehouse on Gertrude Street, Fitzroy.' }
    const report = { passed: true, failed_claims: [], warnings: [] }

    await asService(async () => {
      // v1
      await db.query(
        `insert into operator_description_drafts
           (listing_id, facts_id, version, generated_text, source_facts, model,
            source_binding_passed, source_binding_report, banned_phrase_passed, status, generated_at, submitted_at)
         values ($1, $2, 1, $3, $4::jsonb, $5, true, $6::jsonb, true, 'pending_review', now(), now())`,
        [L1, state.factsId, GEN1, JSON.stringify(facts), 'claude-haiku-4-5-20251001', JSON.stringify(report)],
      )

      // regenerate → supersede any still-pending draft, then insert v2
      await db.query(
        `update operator_description_drafts set status='superseded', updated_at=now()
         where listing_id=$1 and status='pending_review'`,
        [L1],
      )
      await db.query(
        `insert into operator_description_drafts
           (listing_id, facts_id, version, generated_text, source_facts, model,
            source_binding_passed, source_binding_report, banned_phrase_passed, status, generated_at, submitted_at)
         values ($1, $2, 2, $3, $4::jsonb, $5, true, $6::jsonb, true, 'pending_review', now(), now())`,
        [L1, state.factsId, GEN2, JSON.stringify(facts), 'claude-haiku-4-5-20251001', JSON.stringify(report)],
      )

      const rows = (await db.query(
        `select version, status from operator_description_drafts where listing_id=$1 order by version`, [L1],
      )).rows
      assert.deepEqual(rows, [
        { version: 1, status: 'superseded' },
        { version: 2, status: 'pending_review' },
      ])
    })
  })

  test('operator A can read drafts but cannot approve or insert one (RLS)', async () => {
    await asOperator(A, async () => {
      const seen = await db.query(`select count(*)::int n from operator_description_drafts`)
      assert.equal(seen.rows[0].n, 2, 'A reads their own two drafts')

      // Approve-style UPDATE: no UPDATE policy exists → it silently matches zero
      // rows (RLS no-op), so an operator can never flip status to approved or set
      // approved_text.
      const upd = await db.query(
        `update operator_description_drafts
           set status='approved', approved_text='HACKED-BY-OPERATOR', updated_at=now()
         where listing_id=$1 returning id`,
        [L1],
      )
      assert.equal(upd.rows.length, 0, 'operator UPDATE-to-approved affects zero rows')

      // INSERT: no INSERT policy → WITH CHECK denies it outright.
      await assert.rejects(
        () => db.query(
          `insert into operator_description_drafts (listing_id, version, generated_text, status)
           values ($1, 99, 'forged', 'approved')`,
          [L1],
        ),
        (e) => e.code === '42501',
        'operator INSERT of a draft is denied',
      )
    })

    // Confirm via the service role that nothing was actually mutated.
    await asService(async () => {
      const bad = await db.query(
        `select count(*)::int n from operator_description_drafts
         where status='approved' or approved_text is not null`,
      )
      assert.equal(bad.rows[0].n, 0, 'no draft was approved or got approved_text')
    })
  })

  test('operator A cannot write listings.description directly', async () => {
    await asOperator(A, async () => {
      // authenticated has SELECT only on listings → a write is denied. (Either a
      // privilege error or a zero-row no-op would be acceptable; we assert the
      // published field is provably untouched below regardless.)
      await assert.rejects(
        () => db.query(`update listings set description='HACKED', data_source='operator_verified' where id=$1`, [L1]),
        (e) => e.code === '42501',
        'operator UPDATE of listings is denied',
      )
    })
    await asService(async () => {
      const r = await db.query(`select description from listings where id=$1`, [L1])
      assert.equal(r.rows[0].description, null, 'listings.description is still unpublished')
    })
  })

  test('admin approval publishes the (edited) approved text to listings.description', async () => {
    await asService(async () => {
      // Approve v2 with admin-edited text.
      const v2 = (await db.query(
        `select id from operator_description_drafts where listing_id=$1 and version=2`, [L1],
      )).rows[0]
      await db.query(
        `update operator_description_drafts
           set approved_text=$2, status='approved', admin_note=$3, reviewed_by='admin', approved_at=now(), updated_at=now()
         where id=$1`,
        [v2.id, APPROVED_TEXT, 'tightened the second line'],
      )
      // Publish: the only place generated text becomes live.
      await db.query(
        `update listings set description=$2, data_source='operator_verified' where id=$1`,
        [L1, APPROVED_TEXT],
      )

      const listing = (await db.query(`select description, data_source from listings where id=$1`, [L1])).rows[0]
      assert.equal(listing.description, APPROVED_TEXT, 'published text is the admin-approved text')
      assert.match(listing.description, /admin edit/, 'admin\'s edit (not the raw generation) is what published')
      assert.equal(listing.data_source, 'operator_verified', 'provenance recorded')

      const drafts = (await db.query(
        `select version, status, approved_text from operator_description_drafts where listing_id=$1 order by version`, [L1],
      )).rows
      assert.equal(drafts[0].status, 'superseded')
      assert.equal(drafts[1].status, 'approved')
      assert.equal(drafts[1].approved_text, APPROVED_TEXT)
    })
  })
})
