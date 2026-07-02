-- 210_operator_stories.sql
--
-- "Your story, written by the Atlas" — a paid Service-pillar perk. The operator
-- answers a short guided interview in the dashboard; Claude drafts a ~200-word
-- story in the Atlas editorial voice grounded ONLY in those answers + the
-- listing's own name/suburb/vertical (no invented facts); the operator reviews,
-- regenerates or approves; the approved story renders as an operator-attributed
-- panel on /place/[slug].
--
-- Distinct from the editorial `interviews` table (migration 061), which is a
-- CMS artefact authored by Matt with its own slug/published workflow. This
-- table is operator-owned, one row per listing, with a draft→generated→live
-- approval lifecycle.
--
--   answers      — jsonb { "1": "...", ... } keyed to the 7 fixed questions.
--   draft        — the current Claude-generated story text (operator reviews it).
--   status       — draft (answering) → generated (a draft exists) →
--                  live (operator approved; renders publicly) → retired.
--   generated_at — when the current draft was produced (rate-limit + audit).
--   approved_at  — when the operator last set it live.
--
-- NOTE: pay-to-win guard — the story renders as an operator-attributed panel on
-- the venue's own page only. Nothing here feeds search/map/discover ranking.
--
-- ── ROLLBACK ──  drop table if exists public.operator_stories;

create table if not exists public.operator_stories (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null unique references public.listings(id) on delete cascade,
  answers      jsonb not null default '{}'::jsonb,
  draft        text,
  status       text not null default 'draft'
                 check (status in ('draft', 'generated', 'live', 'retired')),
  generated_at timestamptz,
  approved_at  timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- The public place page reads the single live story for a listing.
create index if not exists idx_operator_stories_listing_live
  on public.operator_stories (listing_id)
  where status = 'live';

-- RLS: enabled. Anon may read only LIVE stories (what the public page shows);
-- all writes are service-role only, via the dashboard route (owner + paid gate
-- enforced there).
alter table public.operator_stories enable row level security;

drop policy if exists "Anon can read live operator stories" on public.operator_stories;
create policy "Anon can read live operator stories" on public.operator_stories
  for select to anon
  using (status = 'live');

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
