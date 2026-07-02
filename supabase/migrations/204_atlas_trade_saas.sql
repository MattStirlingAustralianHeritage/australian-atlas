-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 204: Atlas Trade — SaaS layer (directory, fact sheets,
--                enquiries, shortlists, day-planned proposals)
-- ============================================================
--
-- Extends the Atlas Trade beta (migrations 170 + 184) into a working
-- B2B SaaS for the travel trade. Five parts:
--
--   1. listing_trade_profiles   — the operator-authored "product fact sheet"
--                                 depth (notice period, coach access, languages,
--                                 dietary, capacity, seasonality, insurance,
--                                 famils, and a TRADE-ONLY contact channel).
--                                 A separate table — NOT columns on listings —
--                                 because listings is anon-readable via
--                                 PostgREST and the trade contact channel must
--                                 never leak to the public. RLS enabled with
--                                 NO policies: service-role reads only.
--   2. trade_itinerary_stops    — day / time_hint for day-structured proposals.
--   3. trade_itineraries        — client_name / cover_note (proposal framing).
--   4. trade_accounts           — co-branding (org website / logo) + focus
--                                 regions for the new-product radar. Co-brand,
--                                 never white-label: "Curated via Atlas" stays.
--   5. trade_shortlists(+items) — saved venue shortlists (research → build).
--   6. trade_enquiries          — tracked trade→operator enquiries (rates /
--                                 availability / famil / general). Atlas routes
--                                 the intro; the deal happens directly.
--
-- Consent + privacy posture unchanged: trade-readiness remains ENRICHMENT,
-- never a pool filter; the trade_buildable_listings view (170) stays the sole
-- trade-ready predicate. Nothing here renders on any consumer surface.
--
-- Additive, non-destructive, idempotent. No deployed code reads these
-- objects until the accompanying app code ships.
--
-- ── ROLLBACK ────────────────────────────────────────────────
--   node scripts/run-migration.mjs supabase/migrations/204_atlas_trade_saas_down.sql
-- ============================================================

-- ── 1. listing_trade_profiles ───────────────────────────────
create table if not exists public.listing_trade_profiles (
  listing_id          uuid primary key references public.listings(id) on delete cascade,
  -- Logistics the trade needs before they'll contract a venue.
  notice_days         integer check (notice_days is null or (notice_days >= 0 and notice_days <= 365)),
  coach_access        boolean not null default false,
  languages           text[],
  dietary_notes       text,
  capacity_notes      text,
  seasonal_notes      text,
  -- Self-declared: current public liability insurance in place.
  insurance_confirmed boolean not null default false,
  -- Open to famils (familiarisation visits by trade buyers).
  famil_open          boolean not null default false,
  -- TRADE-ONLY contact channel (never public; never rendered outside gated
  -- trade surfaces). Falls back to the claim email when absent.
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.listing_trade_profiles is
  'Operator-authored trade depth behind the trade_welcome switch (migration 170). Separate from listings because it carries a trade-only contact channel — service-role reads only, no anon policy, never rendered on consumer surfaces.';

alter table public.listing_trade_profiles enable row level security;
-- Deliberately NO policies: PostgREST anon/authenticated see nothing.
-- All reads/writes flow through service-role API routes that gate ownership
-- (dashboard PATCH) or a trade account (gated trade surfaces) in app code.

-- ── 2. day structure on stops ───────────────────────────────
alter table public.trade_itinerary_stops
  add column if not exists day integer not null default 1
    check (day >= 1 and day <= 60),
  add column if not exists time_hint text;

comment on column public.trade_itinerary_stops.day is
  'One-based day number within the itinerary (day-structured proposals).';
comment on column public.trade_itinerary_stops.time_hint is
  'Optional freeform time hint for the stop, e.g. "10:00" or "after lunch".';

-- ── 3. proposal framing on itineraries ──────────────────────
alter table public.trade_itineraries
  add column if not exists client_name text,
  add column if not exists cover_note text;

comment on column public.trade_itineraries.client_name is
  'Optional "Prepared for …" line on the shared proposal (agent''s client / group).';
comment on column public.trade_itineraries.cover_note is
  'Optional intro paragraph rendered above the stops on the shared proposal.';

-- ── 4. co-branding + radar focus on trade accounts ──────────
alter table public.trade_accounts
  add column if not exists org_website   text,
  add column if not exists org_logo_url  text,
  add column if not exists focus_regions text[];

comment on column public.trade_accounts.org_logo_url is
  'Co-brand logo shown BESIDE the Atlas attribution on shared itineraries. Co-branding, never white-label — "Curated via Atlas" is not removable (AUP).';

-- ── 5. shortlists ───────────────────────────────────────────
create table if not exists public.trade_shortlists (
  id               uuid primary key default gen_random_uuid(),
  trade_account_id uuid not null references public.trade_accounts(id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists trade_shortlists_account_idx
  on public.trade_shortlists (trade_account_id);

create table if not exists public.trade_shortlist_items (
  id           uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.trade_shortlists(id) on delete cascade,
  listing_id   uuid not null references public.listings(id) on delete cascade,
  note         text,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (shortlist_id, listing_id)
);

create index if not exists trade_shortlist_items_idx
  on public.trade_shortlist_items (shortlist_id, position);

comment on table public.trade_shortlists is
  'A trade account''s saved venue shortlist — the research surface between the directory and the builder.';

alter table public.trade_shortlists      enable row level security;
alter table public.trade_shortlist_items enable row level security;

-- Owner-scoped, mirroring trade_itineraries (defense-in-depth; writes flow
-- through service-role routes that gate ownership in app code).
drop policy if exists trade_shortlists_owner_all on public.trade_shortlists;
create policy trade_shortlists_owner_all on public.trade_shortlists
  for all to authenticated
  using (exists (
    select 1 from public.trade_accounts a
    where a.id = trade_shortlists.trade_account_id and a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.trade_accounts a
    where a.id = trade_shortlists.trade_account_id and a.user_id = auth.uid()
  ));

drop policy if exists trade_shortlist_items_owner_all on public.trade_shortlist_items;
create policy trade_shortlist_items_owner_all on public.trade_shortlist_items
  for all to authenticated
  using (exists (
    select 1 from public.trade_shortlists s
    join public.trade_accounts a on a.id = s.trade_account_id
    where s.id = trade_shortlist_items.shortlist_id and a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.trade_shortlists s
    join public.trade_accounts a on a.id = s.trade_account_id
    where s.id = trade_shortlist_items.shortlist_id and a.user_id = auth.uid()
  ));

-- ── 6. enquiries ────────────────────────────────────────────
create table if not exists public.trade_enquiries (
  id               uuid primary key default gen_random_uuid(),
  trade_account_id uuid not null references public.trade_accounts(id) on delete cascade,
  listing_id       uuid not null references public.listings(id) on delete cascade,
  enquiry_type     text not null default 'general'
    check (enquiry_type in ('rates','availability','famil','general')),
  message          text not null,
  group_size       integer check (group_size is null or (group_size >= 1 and group_size <= 100000)),
  travel_window    text,
  status           text not null default 'sent'
    check (status in ('sent','answered','closed')),
  -- Render-resilience snapshots (the listing may later be hidden/retired; the
  -- recipient address may later change).
  venue_name       text,
  sent_to          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists trade_enquiries_account_idx
  on public.trade_enquiries (trade_account_id, created_at desc);
create index if not exists trade_enquiries_listing_idx
  on public.trade_enquiries (listing_id);

comment on table public.trade_enquiries is
  'Tracked trade→operator enquiry (rates / availability / famil / general). Atlas sends the intro email and logs it; replies happen directly between the parties (reply-to = the trade account). Status is buyer-maintained.';

alter table public.trade_enquiries enable row level security;

-- Owner may read + update the status of their own enquiries. Inserts happen
-- via the service-role enquiry route (which also sends the email) — no insert
-- policy on purpose.
drop policy if exists trade_enquiries_owner_select on public.trade_enquiries;
create policy trade_enquiries_owner_select on public.trade_enquiries
  for select to authenticated
  using (exists (
    select 1 from public.trade_accounts a
    where a.id = trade_enquiries.trade_account_id and a.user_id = auth.uid()
  ));

drop policy if exists trade_enquiries_owner_update on public.trade_enquiries;
create policy trade_enquiries_owner_update on public.trade_enquiries
  for update to authenticated
  using (exists (
    select 1 from public.trade_accounts a
    where a.id = trade_enquiries.trade_account_id and a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.trade_accounts a
    where a.id = trade_enquiries.trade_account_id and a.user_id = auth.uid()
  ));

-- ── updated_at touch triggers (match the portal convention) ─
create or replace function public.touch_trade_saas_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_listing_trade_profiles_touch on public.listing_trade_profiles;
create trigger trg_listing_trade_profiles_touch
  before update on public.listing_trade_profiles
  for each row execute function public.touch_trade_saas_updated_at();

drop trigger if exists trg_trade_shortlists_touch on public.trade_shortlists;
create trigger trg_trade_shortlists_touch
  before update on public.trade_shortlists
  for each row execute function public.touch_trade_saas_updated_at();

drop trigger if exists trg_trade_enquiries_touch on public.trade_enquiries;
create trigger trg_trade_enquiries_touch
  before update on public.trade_enquiries
  for each row execute function public.touch_trade_saas_updated_at();
