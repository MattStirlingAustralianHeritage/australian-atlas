-- 209_listing_qna.sql
--
-- Venue Q&A — operator-authored questions & answers ("Do you take walk-ins?",
-- "Is there parking?") shown as a clearly operator-attributed block on the
-- public /place/[slug] page. Unlike offers/awards this content is also fed to
-- the embedding pipeline (it enriches the venue's own search text) and to the
-- "Ask the Atlas" concierge grounding context — so a visitor's plain-language
-- question can be answered from the operator's own words. It is NOT time-boxed.
--
-- Written ONLY via the operator dashboard route (app/api/dashboard/qna —
-- Bearer shared-JWT + listing_claims ownership + paid gate), through the
-- service role. The cap (8 rows per listing) is an app-layer guardrail in that
-- route, not a DB invariant.
--
-- NOTE: pay-to-win guard — Q&A renders as a clearly operator-attributed block
-- on /place/[slug] ONLY, and enriches THIS venue's own search text. Nothing may
-- read this table to influence search/map/discover RANKING or any
-- visitor-facing ORDERING.
--
-- RLS: enabled. Anon may SELECT only published rows (the public page + the
-- concierge grounding read exactly those). All writes are service-role only
-- (no write policy).
--
-- ── ROLLBACK ────────────────────────────────────────────────
--   drop table if exists public.listing_qna;

begin;

create table if not exists public.listing_qna (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  question    text not null check (char_length(question) <= 120),
  answer      text not null check (char_length(answer) <= 600),
  position    int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Primary read: "published Q&A for listing X in author order".
create index if not exists idx_listing_qna_listing_position
  on public.listing_qna (listing_id, position);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.listing_qna enable row level security;

-- Visitors may read exactly what the public page renders: published rows.
-- Unpublished rows stay owner-only (service role via the dashboard route).
drop policy if exists "Anon can read published listing qna" on public.listing_qna;
create policy "Anon can read published listing qna" on public.listing_qna
  for select to anon
  using (published = true);

commit;

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
