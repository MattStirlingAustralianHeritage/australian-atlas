-- ============================================================
-- 102_description_promotion_snapshot.sql
-- Audit table for description_v2 → description promotions.
-- Each promotion writes a snapshot row capturing before/after
-- so any vertical can be rolled back per the query at the bottom.
-- ============================================================

create table if not exists description_promotion_snapshot (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  description_before text,
  description_after text,
  vertical text,
  promoted_at timestamptz not null default now()
);

create index if not exists idx_promotion_snapshot_listing_id on description_promotion_snapshot (listing_id);
create index if not exists idx_promotion_snapshot_vertical on description_promotion_snapshot (vertical);
create index if not exists idx_promotion_snapshot_promoted_at on description_promotion_snapshot (promoted_at desc);

-- ============================================================
-- Rollback a single vertical (in case of regret):
--
--   update listings
--   set description = snap.description_before
--   from description_promotion_snapshot snap
--   where listings.id = snap.listing_id
--     and snap.vertical = '<vertical>'
--     and snap.promoted_at = (
--       select max(promoted_at)
--       from description_promotion_snapshot
--       where listing_id = listings.id
--     );
-- ============================================================
