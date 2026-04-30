-- ============================================================
-- 110_backfill_log.sql
--
-- Audit log for column backfills. Currently used by
-- scripts/backfill-curatorial-signals.mjs to record each populated
-- value with its source-text excerpt and the heuristic that
-- triggered it.
--
-- Source binding: every row in backfill_log is the audit trail for
-- one (listing, column) value. The source_text_excerpt is the
-- substring of the underlying field (typically listings.description)
-- that the heuristic matched against. The editor can re-verify any
-- populated value by reading the excerpt back to the source.
--
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists backfill_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  column_name text not null,
  old_value text,
  new_value text not null,
  source_text_excerpt text,
  heuristic_used text not null,
  recorded_at timestamptz not null default now(),
  recorded_by text not null default 'backfill-curatorial-signals.mjs'
);

create index if not exists backfill_log_listing_idx on backfill_log (listing_id);
create index if not exists backfill_log_column_idx on backfill_log (column_name);
create index if not exists backfill_log_recorded_at_idx on backfill_log (recorded_at desc);
