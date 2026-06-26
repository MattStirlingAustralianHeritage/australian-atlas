-- ============================================================
-- 185 — taste_profiles (FOUNDATION, additive)
--
-- One durable, per-user taste record on the portal (the SSOT). Persists BOTH
-- taste representations the codebase already computes statelessly:
--   • taste_vector    — the embedding substrate System A feeds to
--                       search_listings_hybrid (lib/discover/tasteVector.js).
--                       Stored as the L2-normalised MEAN of the user's POSITIVE
--                       listing embeddings (no session skips — skips stay live
--                       in System A at feed time).
--   • category_shares — the vertical/sub_type/region shares System B uses for
--                       plan-a-stay / on-this-road (lib/discover/tasteProfile.js),
--                       same shape as getUserTasteProfile() returns.
--
-- This migration is SCHEMA ONLY. The recompute function (186) and the
-- write-through triggers (187) populate it. The table is a CACHE; the source of
-- truth is user_saves + trail_stops — it can always be rebuilt from them.
--
-- NO consumer/surface is rewired by this work. Foundation only.
-- ============================================================

begin;

create table if not exists public.taste_profiles (
  profile_id       uuid primary key references public.profiles(id) on delete cascade,
  taste_vector     vector(1024),                        -- l2_normalize(avg(positive embeddings)); NULL if no positive has an embedding
  category_shares  jsonb not null default '{}'::jsonb,  -- { savedCount, verticalWeights, subTypeWeights, regionWeights }
  source_count     int   not null default 0,            -- distinct positive listings used
  source_breakdown jsonb not null default '{}'::jsonb,  -- { user_saves, trail_stops, distinct, with_embedding }
  updated_at       timestamptz not null default now()
);

comment on table public.taste_profiles is
  'Durable per-user taste cache. Rebuilt from user_saves + owned trail_stops by recompute_taste_profile(). Cache only — saves/trails are the source of truth.';

-- No vector index: access is a point-read by profile_id (one row per user), not
-- similarity ACROSS profiles. Add an HNSW index only if a future "users like
-- you" feature needs cross-profile ANN.

alter table public.taste_profiles enable row level security;

-- Owner-read; writes come only from the SECURITY DEFINER recompute fn (triggers)
-- and the service-role backfill, both of which bypass RLS. No client write policy.
drop policy if exists "owner reads own taste profile" on public.taste_profiles;
create policy "owner reads own taste profile"
  on public.taste_profiles
  for select
  to authenticated
  using ( (select auth.uid()) = profile_id );

commit;
