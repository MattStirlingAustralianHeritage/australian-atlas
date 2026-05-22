-- ============================================================
-- Legacy description rewrite — Part 1 infrastructure
--
-- Purpose: rewrite legacy listing descriptions to current Atlas
-- voice standard, writing into description_v2 (NOT overwriting
-- the published description field). Promotion to description is
-- a separate, manual editorial step via the Humanator admin tool.
--
-- This migration adds:
--   1. listings.description_v2 (nullable TEXT) — staging column
--      for rewrites. Never user-facing until promoted to description.
--   2. description_rewrite_log — append-only audit of every rewrite
--      attempt, including the source text scraped from the venue
--      website (so we can re-verify grounding later) and the
--      final status. One row per attempt; reruns append.
--
-- Rollback:
--   DROP TABLE IF EXISTS description_rewrite_log;
--   ALTER TABLE listings DROP COLUMN IF EXISTS description_v2;
--
-- Idempotent: safe to re-run.
-- ============================================================

alter table listings
  add column if not exists description_v2 text;

create table if not exists description_rewrite_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  old_description text,
  new_description text,
  source_url text,
  source_text text,
  rewrite_status text not null check (rewrite_status in (
    'success',
    'no_source',
    'fetch_failed',
    'too_thin',
    'quality_fail'
  )),
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_description_rewrite_log_listing_id
  on description_rewrite_log (listing_id);

create index if not exists idx_description_rewrite_log_status
  on description_rewrite_log (rewrite_status);

create index if not exists idx_description_rewrite_log_created_at
  on description_rewrite_log (created_at desc);
