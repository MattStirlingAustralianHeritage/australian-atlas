-- ============================================================
-- 112_sync_log.sql
--
-- Audit log for portal → vertical sync writes. Each row records
-- one push of a listing to its vertical's source DB, capturing the
-- region resolution path used (override / computed / legacy / null)
-- and the response status of both the vertical write and the
-- subsequent cache revalidation.
--
-- This makes it visible which listings are currently being synced
-- using the legacy `listings.region` text column as the fallback —
-- a useful signal as Phase 3 of the regions overhaul progresses
-- and verticals migrate to override-aware schemas.
--
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists sync_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  vertical text not null,
  source_id text,
  resolved_region_name text,
  -- The fallback chain in resolveRegionName():
  --   override : listings.region_override_id resolved to regions.name
  --   computed : listings.region_computed_id resolved to regions.name
  --   legacy   : listings.region (deprecated text column) used as-is
  --   null     : nothing populated; vertical received NULL region
  resolution_source text not null check (resolution_source in ('override','computed','legacy','null')),
  sync_action text not null check (sync_action in ('insert','update','sync')),
  vertical_response_status text,
  revalidate_response_status text,
  error_message text,
  synced_at timestamptz not null default now()
);

create index if not exists sync_log_listing_idx on sync_log (listing_id);
create index if not exists sync_log_vertical_idx on sync_log (vertical);
create index if not exists sync_log_synced_at_idx on sync_log (synced_at desc);
create index if not exists sync_log_resolution_source_idx on sync_log (resolution_source);
