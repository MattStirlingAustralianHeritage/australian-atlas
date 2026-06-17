-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 173: Tighten "Public can read live regions" — drop the `OR true`
-- ============================================================
--
-- WHY THIS EXISTS (follow-up to migration 171)
-- --------------------------------------------------------------
-- Migration 171 locked down anon/authenticated access across the public
-- schema. For `regions` it dropped the over-permissive blanket
-- "Service role full access regions" and INTENTIONALLY KEPT the existing read
-- policy "Public can read live regions" — on the assumption that policy
-- already restricted reads to live rows. It does not.
--
-- The kept policy's USING expression is:
--     (status = 'live'::text) OR true
-- The `OR true` short-circuits the predicate to constant TRUE, so the policy
-- authorises EVERY row regardless of status. The browser-shipped anon key
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY) can therefore read DRAFT / unpublished
-- regions straight off the auto-generated PostgREST REST API:
--     GET /rest/v1/regions?status=eq.draft   →  all draft rows
--
-- No PII is involved (regions hold editorial copy + map metadata), but this
-- leaks UNPUBLISHED editorial content — draft region names, descriptions and
-- generated intros that have not been released. Confirmed with a live anon-key
-- probe against production on 2026-06-17 (19 draft rows returned to the anon
-- key; 69 live).
--
-- DESIGN — verified against the codebase before writing (2026-06-17)
-- --------------------------------------------------------------
-- Every read of `regions` in the app goes through the service-role client
-- (getSupabaseAdmin(), lib/supabase/clients.js), which BYPASSES RLS — so this
-- change is invisible to the application. A full sweep of all ~45 `.from(
-- 'regions')` call sites found NO anon-client or authed-client reads, no
-- 'use client' component that queries regions directly, and no direct anon-key
-- fetch to /rest/v1/regions. The two public API surfaces that expose regions
-- (app/api/v1/regions, app/api/regions/validate) already filter status='live'
-- in the query itself. Nothing relies on the anon role reading non-live rows.
--
-- THE FIX
-- --------------------------------------------------------------
-- Drop and recreate "Public can read live regions" with the honest predicate
-- `using (status = 'live')` — no `OR true`. The command (SELECT) and role
-- target (public) are preserved exactly; only the always-true escape hatch is
-- removed. After this, anon/authenticated may read live regions ONLY; the
-- service role is unaffected (BYPASSRLS).
--
-- RLS is already enabled on `regions` in production (verified 2026-06-17); the
-- `enable row level security` below is an idempotent safety net so the policy
-- is never created against an unguarded table.
--
-- ── ROLLBACK ────────────────────────────────────────────────
--   drop policy if exists "Public can read live regions" on regions;
--   create policy "Public can read live regions" on regions
--     for select to public using ((status = 'live') or true);
--   -- (restores the PRE-EXISTING, vulnerable always-true behaviour)
-- ============================================================

begin;

alter table regions enable row level security;  -- already enabled in prod; idempotent

drop policy if exists "Public can read live regions" on regions;
create policy "Public can read live regions" on regions
  for select to public
  using (status = 'live');

commit;

-- PostgREST must reload so the new policy predicate takes effect immediately.
notify pgrst, 'reload schema';
