-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 171: Enable Row Level Security on public-schema tables
-- ============================================================
--
-- WHY THIS EXISTS (security incident — PII + integrity exposure)
-- --------------------------------------------------------------
-- Supabase exposes every public-schema table through the auto-generated
-- PostgREST API, and the default Supabase grants give the `anon` and
-- `authenticated` roles FULL DML (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) on
-- those tables. Row Level Security (RLS) is the ONLY thing standing between
-- the browser-shipped anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) and the data.
--
-- A live probe with the production anon key (2026-06-17) confirmed real
-- exposure. Examples, read straight from the REST API with the public key:
--     claims_review     →   9 rows  (claimant_email, claimant_name, admin_notes)
--     claim_audit_log   →  34 rows
--     claim_attempts    →  11 rows  (RLS *on* but a public USING(true) policy)
--     profiles          →  10 rows  (email, full_name — public USING(true) policy)
--     pageviews         → 32,576 rows (user_agent — public USING(true) policy)
-- Because the grants include INSERT/UPDATE/DELETE, the same key could also
-- mutate or TRUNCATE these tables (e.g. `DELETE FROM listings`).
--
-- TWO DEFECT CLASSES WERE FOUND:
--   1. RLS simply DISABLED on the table (default grants → anon full DML).
--   2. RLS enabled, but a policy named "Service role full access …" was
--      created `FOR ALL TO public USING (true) WITH CHECK (true)`. Since
--      service_role already bypasses RLS (BYPASSRLS), that policy does NOT
--      restrict the service role — it silently grants full DML to `public`
--      (anon + authenticated). These are dropped here.
--
-- DESIGN — verified against the codebase before writing (2026-06-17)
-- --------------------------------------------------------------
-- The portal reads data with the service-role client (`getSupabaseAdmin()`,
-- lib/supabase/clients.js) in SSR pages, API routes and crons — service role
-- BYPASSES RLS, so locking tables does NOT affect it. The anon key is used
-- for data in only two narrow places, both verified:
--   • the (server-rendered) public share page app/trip/[slug]/page.js, which
--     reads plan_a_stay_trips (already scoped by an `is_public` policy) and
--     road_trips (a read policy is added below); and
--   • six user-scoped API routes that use the authed client (auth-clients.js):
--     user/visits, user/saves, views, for-you/dismiss, discover/save,
--     discover/merge-session — covered by the per-user / scoped policies below.
-- Every other table is service-role-only, so RLS-with-no-policy is correct.
--
-- This mirrors the pattern established by migrations 167–169 (legal_*):
-- `enable row level security` with NO public policy = service-role-only.
--
-- NOT TOUCHED (intentionally):
--   • spatial_ref_sys — PostGIS extension-owned reference table; RLS would
--     break coordinate transforms and we don't own it.
--   • Tables already correctly RLS-on with no public policy (newsletter_
--     subscribers, listings_quarantine, curation_review, way_candidates, …).
--   • trips — keeps its intentional public read/insert (legacy, no PII). The
--     unauthenticated INSERT is a spam vector flagged separately, not changed
--     here to avoid breaking a possibly-live anon trip-save path.
--
-- ── ROLLBACK (full) ─────────────────────────────────────────
--   Per table: `alter table <t> disable row level security;`
--   Re-create dropped policies from git history (introspected list in the
--   migration PR). Rollback restores the PRE-EXISTING (vulnerable) state.
-- ============================================================

begin;

-- ============================================================
-- SECTION A — Enable RLS, service-role-only (no policy)
-- ------------------------------------------------------------
-- Defect class 1. These tables are accessed ONLY via the service-role client
-- (admin SSR / API routes / crons). Enabling RLS with no policy denies anon
-- and authenticated entirely while the service role continues to bypass RLS.
-- ============================================================

-- ── Claim / contact / PII intake ────────────────────────────
alter table claims_review            enable row level security;  -- claimant_email/name, admin_notes
alter table claim_audit_log          enable row level security;
alter table listing_suggestions      enable row level security;  -- submitter_email
alter table story_ideas              enable row level security;  -- contact_details, notes
alter table operator_outreach        enable row level security;  -- contact_email, notes
alter table failed_role_promotions   enable row level security;  -- user_email
alter table client_errors            enable row level security;  -- user_agent, user_id
alter table digest_subscriptions     enable row level security;  -- email, user_id (no code reads it yet)
alter table interviews               enable row level security;
alter table media_coverage_log       enable row level security;

-- ── Credentials / keys ──────────────────────────────────────
alter table api_keys                 enable row level security;
alter table api_request_logs         enable row level security;

-- ── Prospecting / dedup / sync / search pipeline (internal) ──
alter table listing_candidates       enable row level security;  -- notes, phone
alter table candidates_disqualified  enable row level security;
alter table candidates_wrong_vertical enable row level security;
alter table dedup_flags              enable row level security;
alter table duplicate_pairs          enable row level security;
alter table listing_scores           enable row level security;
alter table listing_history          enable row level security;
alter table listing_relationships    enable row level security;
alter table commercial_groups        enable row level security;  -- notes
alter table backfill_log             enable row level security;
alter table sync_log                 enable row level security;
alter table query_embedding_cache    enable row level security;
alter table search_events            enable row level security;
alter table search_logs              enable row level security;  -- session_id, user_id
alter table place_memories           enable row level security;
alter table region_narratives        enable row level security;
alter table vertical_noun_mappings   enable row level security;
alter table way_candidate_experiences enable row level security;
alter table plan_a_stay_title_cache  enable row level security;
alter table processed_stripe_events  enable row level security;
alter table agent_runs               enable row level security;
alter table admin_notes              enable row level security;

-- ── Editorial pitch pipeline (internal) ─────────────────────
alter table approved_pitches             enable row level security;
alter table rejected_pitches             enable row level security;
alter table editorial_pitches_deprecated enable row level security;
alter table pitches                      enable row level security;
alter table pitch_generation_failures    enable row level security;
alter table pitch_score_weights          enable row level security;
alter table pitch_slots                  enable row level security;

-- ── Trails / itineraries (admin-served; verified no anon/authed read) ──
alter table trails           enable row level security;  -- created_by
alter table trail_stops      enable row level security;
alter table trail_errors     enable row level security;
alter table user_trails      enable row level security;  -- user_id (written via getSupabaseAdmin only)
alter table collections      enable row level security;

-- ── Legacy ──────────────────────────────────────────────────
alter table events_legacy_061 enable row level security;  -- created_by (1 parked row)

-- ============================================================
-- SECTION B — Drop over-permissive "Service role full access" policies
-- ------------------------------------------------------------
-- Defect class 2. Each policy below is `FOR ALL TO public USING (true)
-- WITH CHECK (true)` — it grants full DML to anon/authenticated and does
-- nothing for the service role (which bypasses RLS anyway). Dropping it
-- leaves the table's remaining scoped policies in force (noted per line);
-- where it was the only policy, the table becomes service-role-only.
-- RLS is already enabled on all of these.
-- ============================================================

-- Become service-role-only (blanket was the only policy):
drop policy if exists "Service role full access daily_summary"   on analytics_daily_summary;
drop policy if exists "Service role full access claim_attempts"  on claim_attempts;        -- ip_hash
drop policy if exists "Service role full access council_accounts" on council_accounts;     -- contact_email/phone, magic_link_token
drop policy if exists "Service role full access council_activity" on council_activity;
drop policy if exists "Service role full access on council_auth_log" on council_auth_log;  -- email, ip_address
drop policy if exists "Service role full access council_content" on council_content;
drop policy if exists "Service role full access council_regions" on council_regions;
drop policy if exists "Allow all for service role"               on pageviews;             -- user_agent (32k rows)

-- Keep a scoped public/own read policy (only the blanket is dropped):
drop policy if exists "Service role full access articles"        on articles;      -- keeps "Public can read published articles"
drop policy if exists "Service role full access listings"        on listings;      -- keeps "Public can read active listings"
drop policy if exists "Service role full access regions"         on regions;       -- keeps "Public can read live regions"
drop policy if exists "Service role full access profiles"        on profiles;      -- keeps "Users can read/update own profile"
drop policy if exists "Service role full access operator_accounts"    on operator_accounts;     -- keeps own-row select/update
drop policy if exists "Service role full access operator_activity"    on operator_activity;     -- keeps own-row select
drop policy if exists "Service role full access operator_collections" on operator_collections;  -- keeps own-row CRUD
drop policy if exists "Service role full access operator_trails"      on operator_trails;       -- keeps own-row CRUD
drop policy if exists "Service role full access user_saves"      on user_saves;    -- keeps own-row view/insert/delete

-- events → service-role-only. EVERY events row carries submitter PII
-- (submitter_email, created_by), so it can't be safely row-filtered for anon.
-- A column-level revoke is ineffective here (anon keeps the table-level SELECT
-- grant). The app reads events exclusively via the service role and gates
-- visibility with its own status filters (lib/events.js applyPublic), so
-- dropping BOTH policies closes the submitter-PII leak with no app impact.
-- (If a public events REST surface is ever needed, expose a curated view of
--  safe columns instead of opening the base table.)
drop policy if exists "Service role full access events"  on events;
drop policy if exists "Public can read approved events"   on events;

-- ============================================================
-- SECTION C — Per-user policies (authed client, auth required)
-- ------------------------------------------------------------
-- These tables are written/read by API routes that use the authed client
-- (auth-clients.js) and require a logged-in user (they 401 otherwise). A
-- single FOR ALL policy scoped to the owner covers SELECT/INSERT/UPDATE/
-- DELETE (incl. the upsert paths). anon has no auth.uid() → denied.
-- Mirrors the existing user_saves own-row policies.
-- ============================================================

alter table user_visits    enable row level security;
drop policy if exists "Users manage own visits" on user_visits;
create policy "Users manage own visits" on user_visits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table user_views     enable row level security;
drop policy if exists "Users manage own views" on user_views;
create policy "Users manage own views" on user_views
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table user_dismissals enable row level security;
drop policy if exists "Users manage own dismissals" on user_dismissals;
create policy "Users manage own dismissals" on user_dismissals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- SECTION D — Scoped anon / authenticated policies
-- ------------------------------------------------------------
-- The two genuine non-service-role surfaces.
-- ============================================================

-- serendipity_saves — Discover "save for later".
--   • Anonymous visitors save with user_id = NULL (keyed by session_id).
--   • On login, discover/merge-session claims those rows (user_id NULL → self)
--     then mirrors them into user_saves.
-- Anon may only create/read NULL-owner rows; authenticated only their own;
-- and may claim NULL-owner rows to themselves. No anon UPDATE/DELETE.
alter table serendipity_saves enable row level security;
drop policy if exists "anon insert null-owner saves"     on serendipity_saves;
drop policy if exists "anon read null-owner saves"       on serendipity_saves;
drop policy if exists "authed insert own saves"          on serendipity_saves;
drop policy if exists "authed read own and anon saves"   on serendipity_saves;
drop policy if exists "authed claim null-owner saves"    on serendipity_saves;
create policy "anon insert null-owner saves" on serendipity_saves
  for insert to anon            with check (user_id is null);
create policy "anon read null-owner saves" on serendipity_saves
  for select to anon            using (user_id is null);
create policy "authed insert own saves" on serendipity_saves
  for insert to authenticated   with check (user_id = (select auth.uid()));
-- Authenticated must also SEE null-owner rows: merge-session UPDATEs them with
-- a WHERE/RETURNING, and Postgres applies SELECT policies to those reads. This
-- is no new exposure (anon already reads null-owner rows).
create policy "authed read own and anon saves" on serendipity_saves
  for select to authenticated   using (user_id = (select auth.uid()) or user_id is null);
create policy "authed claim null-owner saves" on serendipity_saves
  for update to authenticated
  using (user_id is null or user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- road_trips — legacy "On This Road" public share page (app/trip/[slug]).
-- Read server-side via the anon client; shared by unguessable slug (no
-- public/private flag exists on the table). Read-only for anon/authenticated;
-- the builder writes via the service role. (Pre-existing: created_by/session_id
-- UUIDs are returned with the row — unchanged from prior behaviour.)
alter table road_trips enable row level security;
drop policy if exists "Public can read shared road trips" on road_trips;
create policy "Public can read shared road trips" on road_trips
  for select to anon, authenticated using (true);

commit;

-- PostgREST must reload so the new RLS/policy state takes effect immediately.
notify pgrst, 'reload schema';
