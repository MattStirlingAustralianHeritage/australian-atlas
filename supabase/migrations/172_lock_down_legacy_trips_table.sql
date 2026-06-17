-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 172: Lock down the legacy `trips` table (service-role-only)
-- ============================================================
--
-- WHY THIS EXISTS (follow-up to migration 171)
-- --------------------------------------------------------------
-- Migration 171 (RLS PII lockdown, 2026-06-17) deliberately LEFT `trips`
-- alone and flagged it separately:
--     "trips — keeps its intentional public read/insert (legacy, no PII). The
--      unauthenticated INSERT is a spam vector flagged separately, not changed
--      here to avoid breaking a possibly-live anon trip-save path."
-- This migration is that follow-up. The "possibly-live anon trip-save path"
-- has now been verified NOT to exist, so the spam vector is closed.
--
-- THE DEFECT
-- --------------------------------------------------------------
-- `trips` has two policies, both granted to PUBLIC (anon + authenticated):
--     "Public can create trips"  FOR INSERT  WITH CHECK (true)
--     "Public can read trips"    FOR SELECT  USING (true)
-- The browser-shipped anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) can therefore
-- INSERT arbitrary rows through the auto-generated PostgREST API — an
-- unauthenticated, unrate-limited spam/abuse vector.
--
-- DESIGN — verified against the codebase + live DB before writing (2026-06-17)
-- --------------------------------------------------------------
-- `trips` is a DEAD legacy itinerary-share table:
--   • Code: ZERO references. `grep -rE "\.from\(\s*[\"'`]trips[\"'`]\s*\)"`
--     across the repo returns nothing; the only `'trips'` string literal is a
--     way-discovery search-keyword list, not a table name.
--   • Superseded: the v2 itinerary-share is `plan_a_stay_trips` (scoped by an
--     `is_public` policy). The public share page app/trip/[slug]/page.js reads
--     `plan_a_stay_trips` + `road_trips` (locked down in 171) — NOT `trips`.
--   • Live state (Management-API + anon-key probe, prod nyhkcmvhwbydsqsyvizs):
--       - RLS already enabled (relrowsecurity = true)
--       - 0 rows
--       - no PII columns (id, title, slug, listing_ids, region,
--         generated_narrative, generated_order, share_count, created_at)
--       - anon SELECT -> 200 []   (read permitted)
--       - anon INSERT {} -> 400 23502 (NOT NULL on listing_ids): the insert
--         PASSED the WITH CHECK(true) RLS policy and failed only on a data
--         constraint — proving anon INSERT is currently permitted.
--
-- Dropping both PUBLIC policies (RLS stays enabled) makes `trips`
-- service-role-only: anon/authenticated get no policy for any command and are
-- denied entirely, while the service-role client (getSupabaseAdmin(),
-- lib/supabase/clients.js) continues to bypass RLS. This mirrors the pattern
-- in migrations 167–169 (legal_*) and 171 §A/§B: RLS-on + no public policy =
-- service-role-only. Because the table is unused, there is no app impact.
--
-- The `enable row level security` below is defensive/idempotent: RLS is
-- already on, but for a security migration we assert it explicitly — dropping
-- the policies while RLS were (somehow) off would leave the table WIDE OPEN
-- (default Supabase grants give anon full DML when RLS is disabled).
--
-- NOT TOUCHED (intentionally):
--   • The table and its data — kept as-is (0 rows; no schema change). This is a
--     pure policy/RLS change, fully reversible.
--   • plan_a_stay_trips / road_trips — the live share tables, already scoped.
--
-- ── ROLLBACK (restores the PRE-EXISTING, vulnerable, public read/insert) ──
--   begin;
--     create policy "Public can create trips" on trips
--       for insert with check (true);
--     create policy "Public can read trips" on trips
--       for select using (true);
--   commit;
--   notify pgrst, 'reload schema';
-- ============================================================

begin;

-- Defensive: ensure RLS is enabled so "no policy" actually denies anon/authed.
-- (Already enabled in prod; idempotent.)
alter table trips enable row level security;

-- Drop the two PUBLIC policies. With RLS on and no remaining policy, `trips`
-- becomes service-role-only (service role bypasses RLS).
drop policy if exists "Public can create trips" on trips;  -- unauthenticated INSERT spam vector
drop policy if exists "Public can read trips"   on trips;  -- public SELECT

commit;

-- PostgREST must reload so the new RLS/policy state takes effect immediately.
notify pgrst, 'reload schema';
