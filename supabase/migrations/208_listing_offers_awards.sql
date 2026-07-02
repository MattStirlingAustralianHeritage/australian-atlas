-- 208_listing_offers_awards.sql
--
-- "Current offers" + "Recognition" (awards) — the two operator-authored
-- content blocks /for-venues now advertises as part of the paid listing.
--
--   • listing_offers — time-boxed promotions ("10% off tastings this month").
--     An offer is publicly visible only while status='live' AND it hasn't
--     passed its valid_to date; expiry is therefore self-enforcing at the
--     read layer (both the anon RLS policy below and the /place server read
--     apply the same predicate) — no cron needed to flip rows to 'expired'.
--     DELETE from the dashboard is a soft delete (status='removed') so the
--     row survives as an audit trail.
--   • listing_awards — recognition entries ("Delicious Produce Awards 2025").
--     Not time-boxed; a compact factual list.
--
-- Both are written ONLY via the operator dashboard routes
-- (app/api/dashboard/offers, app/api/dashboard/awards — Bearer shared-JWT +
-- listing_claims ownership + paid gate), through the service role. Caps
-- (3 live offers / 10 awards per listing) are app-layer guardrails in those
-- routes, not DB invariants.
--
-- NOTE: pay-to-win guard — offers/awards render as clearly operator-attributed
-- blocks on /place/[slug] ONLY. Nothing may read these tables to influence
-- search/map/discover ranking or any visitor-facing ordering.
--
-- The legacy listings.awards column is IGNORED entirely by this feature.
--
-- RLS: enabled on both tables. Anon may SELECT only what the public page
-- shows — live, unexpired offers; awards are all readable (they carry no
-- draft/removed state). All writes are service-role only (no write policies).
--
-- ── ROLLBACK ────────────────────────────────────────────────
--   drop table if exists public.listing_offers;
--   drop table if exists public.listing_awards;

begin;

-- ── Current offers ──────────────────────────────────────────
create table if not exists public.listing_offers (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  title       text not null check (char_length(title) <= 80),
  details     text check (char_length(details) <= 400),
  url         text,
  valid_from  date,
  valid_to    date not null,
  status      text not null default 'live' check (status in ('live', 'expired', 'removed')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Primary read: "live, unexpired offers for listing X" (place page + cap count).
create index if not exists idx_listing_offers_listing_status_valid
  on public.listing_offers (listing_id, status, valid_to);

-- ── Recognition (awards) ────────────────────────────────────
create table if not exists public.listing_awards (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  title       text not null check (char_length(title) <= 120),
  awarded_by  text,
  year        int check (year between 1900 and 2100),
  source_url  text,
  created_at  timestamptz default now()
);

create index if not exists idx_listing_awards_listing
  on public.listing_awards (listing_id);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.listing_offers enable row level security;
alter table public.listing_awards enable row level security;

-- Visitors may read exactly what the public page renders: live offers that
-- haven't passed their end date. Expired/removed rows stay owner-only
-- (service role via the dashboard routes).
drop policy if exists "Anon can read live unexpired offers" on public.listing_offers;
create policy "Anon can read live unexpired offers" on public.listing_offers
  for select to anon
  using (status = 'live' and valid_to >= current_date);

-- Awards have no draft state — every row is public-facing recognition.
drop policy if exists "Anon can read listing awards" on public.listing_awards;
create policy "Anon can read listing awards" on public.listing_awards
  for select to anon
  using (true);

commit;

-- Make PostgREST pick up the new tables immediately.
notify pgrst, 'reload schema';
