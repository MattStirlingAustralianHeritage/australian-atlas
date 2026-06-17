// Stage migration 172 on a throwaway in-memory pglite Postgres BEFORE any prod
// consideration. Replicates the verified BEFORE state, applies the REAL
// migration file, and asserts the lockdown — using correct RLS semantics:
//   • no INSERT policy + RLS on  -> INSERT raises 42501
//   • no SELECT policy + RLS on  -> SELECT silently returns 0 rows (NOT an error)
// so the read lockdown is shown via a superuser-seeded "canary" row that anon
// can see BEFORE and cannot see AFTER (while the service role still can).
// Run: node scripts/stage-trips-migration-pglite.mjs
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = 'supabase/migrations/172_lock_down_legacy_trips_table.sql'
const sql = readFileSync(MIGRATION, 'utf8')

const db = new PGlite()
const policyNames = async () =>
  (await db.query(`select policyname from pg_policies where schemaname='public' and tablename='trips' order by policyname`))
    .rows.map(r => r.policyname)

let ok = true
const assert = (cond, msg) => { console.log(`${cond ? '✓' : '✗ FAIL'} ${msg}`); if (!cond) ok = false }

// anon-role helpers: SET ROLE anon, run, RESET ROLE (mirrors Supabase's
// browser anon role evaluating under RLS; pglite itself runs as superuser).
async function asAnonExec(stmt) {
  await db.exec('set role anon')
  try { await db.exec(stmt); return { ok: true } }
  catch (e) { return { ok: false, code: e.code, message: e.message } }
  finally { await db.exec('reset role') }
}
async function asAnonQuery(stmt) {
  await db.exec('set role anon')
  try { const r = await db.query(stmt); return { ok: true, rows: r.rows } }
  catch (e) { return { ok: false, code: e.code, message: e.message } }
  finally { await db.exec('reset role') }
}

// --- 1. Replicate the verified BEFORE state -------------------------------
await db.exec(`
  create table trips (
    id uuid primary key default gen_random_uuid(),
    title text,
    slug text,
    listing_ids text[] not null,
    region text,
    generated_narrative text,
    generated_order jsonb,
    share_count integer default 0,
    created_at timestamptz default now()
  );
  alter table trips enable row level security;
  create policy "Public can create trips" on trips for insert with check (true);
  create policy "Public can read trips"   on trips for select using (true);
  create role anon nologin;
  grant select, insert, update, delete on trips to anon;
  -- canary row, written as the superuser/service role (bypasses RLS):
  insert into trips (title, listing_ids) values ('canary', '{x,y}');
`)

const before = await policyNames()
console.log('\n[BEFORE] policies on trips:', JSON.stringify(before))
assert(before.length === 2 && before.includes('Public can create trips') && before.includes('Public can read trips'),
  'BEFORE: both PUBLIC policies present (matches prod)')

const selBefore = await asAnonQuery('select id from trips')
console.log('[BEFORE] anon SELECT ->', JSON.stringify(selBefore))
assert(selBefore.ok && selBefore.rows.length === 1, 'BEFORE: anon can READ the canary row (read open)')

const insBefore = await asAnonExec(`insert into trips (listing_ids) values ('{a,b}')`)
console.log('[BEFORE] anon INSERT ->', JSON.stringify(insBefore))
assert(insBefore.ok === true, 'BEFORE: anon INSERT permitted (the vuln reproduced)')
await db.exec(`delete from trips where title is null`)  // remove the anon-inserted probe row

// --- 2. Apply the REAL migration file -------------------------------------
console.log('\n[APPLY]', MIGRATION)
await db.exec(sql)   // throws on any SQL error → staging fails loudly
console.log('✓ migration applied without error')

// --- 3. Assert the AFTER state --------------------------------------------
const after = await policyNames()
console.log('\n[AFTER] policies on trips:', JSON.stringify(after))
assert(after.length === 0, 'AFTER: zero policies remain (service-role-only)')

const rls = (await db.query(`select relrowsecurity from pg_class where oid='public.trips'::regclass`)).rows[0]
assert(rls.relrowsecurity === true, 'AFTER: RLS still enabled')

const svcCount = (await db.query('select count(*)::int as n from trips')).rows[0].n
assert(svcCount === 1, 'AFTER: service role still sees the canary row (data untouched)')

const insAfter = await asAnonExec(`insert into trips (listing_ids) values ('{a,b}')`)
console.log('[AFTER] anon INSERT ->', JSON.stringify(insAfter))
assert(insAfter.ok === false && insAfter.code === '42501', 'AFTER: anon INSERT rejected by RLS (42501)')

const selAfter = await asAnonQuery('select id from trips')
console.log('[AFTER] anon SELECT ->', JSON.stringify(selAfter))
assert(selAfter.ok === true && selAfter.rows.length === 0,
  'AFTER: anon SELECT returns 0 rows — canary hidden (read locked, correct RLS semantics)')

// --- 4. Idempotency: applying again must not error ------------------------
await db.exec(sql)
console.log('\n✓ migration is idempotent (re-applied cleanly)')

console.log(`\n${ok ? 'PGLITE STAGING PASSED ✅' : 'PGLITE STAGING FAILED ❌'}`)
process.exit(ok ? 0 : 1)
