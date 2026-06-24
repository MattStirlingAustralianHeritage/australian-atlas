-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 184: Atlas Trade — beta accounts + attributed itineraries
-- ============================================================
--
-- The B2B trade layer. Three tables, all account-scoped:
--   • trade_accounts          — the beta trade account (a Supabase-auth user who
--                               has accepted the AUP + "Curated via Atlas"
--                               attribution). Acceptance is logged inline
--                               (version + timestamp) — this is the only beta gate.
--   • trade_itineraries       — an attributed, shareable itinerary built from the
--                               curated network. DISTINCT from plan_a_stay_trips
--                               (consumer trips); the two never co-mingle.
--   • trade_itinerary_stops   — ordered stops referencing the master listings table.
--
-- Trade-readiness ENRICHMENT (trade_welcome / trade_* columns from migration 170)
-- is applied to itinerary OUTPUT via the trade_buildable_listings view. It is
-- NEVER a filter on the candidate pool — the builder retrieves over the full
-- curated network. No payment infra: AUP acceptance is the sole beta gate.
--
-- RLS posture mirrors Phase 1: writes flow through service-role API routes that
-- gate ownership in app code (403 on cross-account). RLS policies here are
-- defense-in-depth for any direct PostgREST access, plus the public read-by-slug
-- for published itineraries.
--
-- Additive, non-destructive, idempotent.
--
-- ── ROLLBACK ────────────────────────────────────────────────
--   node scripts/run-migration.mjs supabase/migrations/184_atlas_trade_itineraries_down.sql
-- ============================================================

-- ── trade_accounts ──────────────────────────────────────────
create table if not exists public.trade_accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  org_name                text not null,
  contact_name            text,
  contact_email           text,
  account_type            text not null default 'tour_operator'
    check (account_type in ('tour_operator','dmc','inbound_operator','trip_designer','other')),
  status                  text not null default 'active'
    check (status in ('active','suspended','pending')),
  -- Founding-cohort framing (capped; no dollar figure stored). founding_member
  -- flips false once the cohort cap is reached; both remain free during beta.
  founding_member         boolean not null default true,
  founding_cohort_seq     integer,
  -- Acceptance log (the only beta gate). AUP + "Curated via Atlas" attribution.
  aup_version             integer not null default 1,
  aup_accepted_at         timestamptz,
  attribution_accepted_at timestamptz,
  -- Founding rate locks at signup; first invoice aligns to the 1 July FY.
  founding_rate_locked_at timestamptz,
  first_invoice_on        date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id)
);

create index if not exists trade_accounts_user_idx on public.trade_accounts (user_id);

comment on table public.trade_accounts is
  'Beta trade account (tour operators / DMCs / trip designers). One per Supabase-auth user. aup_accepted_at + attribution_accepted_at are the consent log and the only beta gate — no payment.';

-- ── trade_itineraries ───────────────────────────────────────
create table if not exists public.trade_itineraries (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  trade_account_id uuid not null references public.trade_accounts(id) on delete cascade,
  title            text not null,
  intent_text      text,
  region           text,
  status           text not null default 'draft'
    check (status in ('draft','published','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists trade_itineraries_account_idx on public.trade_itineraries (trade_account_id);
create index if not exists trade_itineraries_slug_idx on public.trade_itineraries (slug);

comment on table public.trade_itineraries is
  'Attributed trade itinerary. "Curated via Atlas" attribution is implicit and always rendered — not a stored, removable flag. DISTINCT from plan_a_stay_trips.';

-- ── trade_itinerary_stops ───────────────────────────────────
create table if not exists public.trade_itinerary_stops (
  id             uuid primary key default gen_random_uuid(),
  itinerary_id   uuid not null references public.trade_itineraries(id) on delete cascade,
  listing_id     uuid not null references public.listings(id) on delete cascade,
  position       integer not null default 0,
  notes          text,
  -- Denormalised for render resilience (mirrors trail_stops): a stop still shows
  -- a name even if the listing row is later hidden/retired.
  venue_name     text,
  venue_vertical text,
  venue_slug     text,
  created_at     timestamptz not null default now()
);

create index if not exists trade_itinerary_stops_itinerary_idx
  on public.trade_itinerary_stops (itinerary_id, position);

comment on table public.trade_itinerary_stops is
  'Ordered stops of a trade itinerary, referencing master listings. Trade-readiness is enriched at render time via trade_buildable_listings; never stored here.';

-- ── RLS ─────────────────────────────────────────────────────
alter table public.trade_accounts        enable row level security;
alter table public.trade_itineraries      enable row level security;
alter table public.trade_itinerary_stops  enable row level security;

-- trade_accounts: an authenticated user sees / updates only their own account.
-- (Inserts happen via the service-role signup route — no insert policy needed.)
drop policy if exists trade_accounts_owner_select on public.trade_accounts;
create policy trade_accounts_owner_select on public.trade_accounts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists trade_accounts_owner_update on public.trade_accounts;
create policy trade_accounts_owner_update on public.trade_accounts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- trade_itineraries: owner (via account) full access; anyone may read PUBLISHED.
drop policy if exists trade_itineraries_owner_all on public.trade_itineraries;
create policy trade_itineraries_owner_all on public.trade_itineraries
  for all to authenticated
  using (exists (select 1 from public.trade_accounts a
                 where a.id = trade_itineraries.trade_account_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.trade_accounts a
                      where a.id = trade_itineraries.trade_account_id and a.user_id = auth.uid()));

drop policy if exists trade_itineraries_public_published on public.trade_itineraries;
create policy trade_itineraries_public_published on public.trade_itineraries
  for select to anon, authenticated using (status = 'published');

-- trade_itinerary_stops: owner full access; public read for stops of published itineraries.
drop policy if exists trade_itinerary_stops_owner_all on public.trade_itinerary_stops;
create policy trade_itinerary_stops_owner_all on public.trade_itinerary_stops
  for all to authenticated
  using (exists (select 1
                 from public.trade_itineraries i
                 join public.trade_accounts a on a.id = i.trade_account_id
                 where i.id = trade_itinerary_stops.itinerary_id and a.user_id = auth.uid()))
  with check (exists (select 1
                      from public.trade_itineraries i
                      join public.trade_accounts a on a.id = i.trade_account_id
                      where i.id = trade_itinerary_stops.itinerary_id and a.user_id = auth.uid()));

drop policy if exists trade_itinerary_stops_public_published on public.trade_itinerary_stops;
create policy trade_itinerary_stops_public_published on public.trade_itinerary_stops
  for select to anon, authenticated
  using (exists (select 1 from public.trade_itineraries i
                 where i.id = trade_itinerary_stops.itinerary_id and i.status = 'published'));

notify pgrst, 'reload schema';
