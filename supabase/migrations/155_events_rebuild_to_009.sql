-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 155: Rebuild `events` to the canonical 009 schema.
--                Parks the legacy 061 table; NO data loss, NO DROP.
-- ============================================================
--
-- WHY
-- Production `events` is the MINIMAL 061_sprint_infrastructure shape
-- (bigint id, `title`, timestamptz dates, `hero_image_url`, `published`,
-- `listing_id`, `is_free`, `region`), but ALL events pipeline code targets
-- the RICH 009_events schema (uuid id, `name`, `image_url`, `verticals[]`,
-- `region_id`, submitter_*/payment_* columns, `status`). The two collided via
-- `CREATE TABLE IF NOT EXISTS events` in both 009 and 061 — whichever ran first
-- won; 061 won on prod. Result: the /api/events/submit insert references ~17
-- columns prod lacks, so the $49 PaymentIntent succeeds and the row write 500s
-- (charge-succeeds-then-write-fails). `events` has never received a pipeline row.
--
-- The earlier ADDITIVE attempt (former migration 155, never applied) was
-- insufficient: inserts still failed on the legacy `title NOT NULL` (code
-- writes `name`, never `title`) and the approve flow needs a uuid id but prod
-- id is bigint. This migration does the clean rebuild instead.
--
-- WHAT THIS DOES
--   (a) RENAME events -> events_legacy_061 (preserves the row + rollback path).
--   (b) Free the two schema-global index names the verbatim 009 rebuild needs
--       (`events_pkey`, `events_slug_key`) — they ride along with the renamed
--       table otherwise and would collide with the new table's auto-created
--       constraint indexes. (Verified live: those are the only colliding names;
--       061's idx_events_dates / idx_events_listing do not clash with 009.)
--   (c) CREATE events reproducing the FULL 009 schema VERBATIM: columns, uuid
--       PK default, CHECK constraints, FK region_id -> regions(id), indexes,
--       RLS + policies, FTS index, and search_events().
--   The single legacy row is NOT copied — it is a manual test row, not a
--   pipeline submission (see "PARKED ROW" below).
--
-- PRE-FLIGHT (verified live against prod ref nyhkcmvhwbydsqsyvizs, 2026-06-10):
--   * row_count(events) = 1; fk_into_events = NONE (nothing references events,
--     so rename/rebuild breaks no dependents).
--   * Every column the submit route writes (name, slug, description, category,
--     start_date, end_date, location_name, address, suburb, state, lat, lng,
--     website_url, ticket_url, image_url, verticals, region_id, submitter_name,
--     submitter_email, submitter_organisation, status, stripe_payment_intent_id,
--     payment_status, amount_paid) plus approved_at / archived_at / submitted_at
--     exists in the 009 schema below. Nothing the code writes is missing.
--
-- PARKED ROW (on record before parking; preserved in events_legacy_061):
--   id=3, title='A test', slug='a-test', description='Testing',
--   listing_id=771af009-ec55-4cc5-9cf5-1ffdd32db542, start_date=2026-06-02,
--   end_date=2026-06-03, ticket_url=NULL, is_free=true, category='Test',
--   state='ACT', region='Canberra', hero_image_url=<storage png>,
--   published=true, created_by=828bdf2c-522d-4683-9e3d-69e1bbec9512,
--   created_at=2026-06-01T09:40:16Z, updated_at=2026-06-01T09:40:16Z.
--
-- ROLLBACK (manual, exact inverse):
--   BEGIN;
--     DROP TABLE events;                                   -- the rebuilt (empty) table
--     ALTER TABLE events_legacy_061 RENAME TO events;
--     ALTER INDEX events_legacy_061_pkey     RENAME TO events_pkey;
--     ALTER INDEX events_legacy_061_slug_key RENAME TO events_slug_key;
--   COMMIT;
--
-- FOLLOW-UP: a later migration DROPs events_legacy_061 once the rebuilt pipeline
-- is proven in production. Do NOT drop it in this migration.
--
-- STATUS: VALIDATED against live schema (information_schema + pg_catalog),
-- 2026-06-10. NOT YET APPLIED. Do not run/merge/deploy from this branch.
-- ============================================================

BEGIN;

-- ── (a) Park the legacy 061 table — no data loss, no DROP ────────────────────
ALTER TABLE events RENAME TO events_legacy_061;

-- ── (b) Free the canonical index names held by the legacy table ──────────────
--     (index names are schema-global; IF EXISTS keeps this safe/idempotent)
ALTER INDEX IF EXISTS events_pkey     RENAME TO events_legacy_061_pkey;
ALTER INDEX IF EXISTS events_slug_key RENAME TO events_legacy_061_slug_key;

-- ── (c) Canonical events table — reproduced VERBATIM from 009_events.sql ──────
CREATE TABLE events (
  id uuid primary key default gen_random_uuid(),

  -- Core details
  name text not null,
  slug text not null unique,
  description text not null,
  start_date date not null,
  end_date date not null,
  location_name text not null,
  suburb text,
  state text not null,
  address text,
  lat double precision,
  lng double precision,
  website_url text,
  ticket_url text,
  image_url text not null,

  -- Category
  category text not null check (category in ('festival', 'market', 'dinner', 'tour', 'exhibition', 'workshop', 'other')),

  -- Multi-vertical association
  verticals text[] not null default '{}',

  -- Region association (spatial lookup)
  region_id uuid references regions(id),

  -- Submitter contact (never public)
  submitter_name text not null,
  submitter_email text not null,
  submitter_organisation text,

  -- Status
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'archived')),

  -- Payment
  stripe_payment_intent_id text,
  payment_status text default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  amount_paid integer,

  -- Timestamps
  submitted_at timestamptz default now(),
  approved_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS events_status_idx ON events(status);
CREATE INDEX IF NOT EXISTS events_dates_idx ON events(start_date, end_date);
CREATE INDEX IF NOT EXISTS events_state_idx ON events(state, status);
CREATE INDEX IF NOT EXISTS events_verticals_idx ON events USING gin(verticals);
CREATE INDEX IF NOT EXISTS events_slug_idx ON events(slug);
CREATE INDEX IF NOT EXISTS events_region_idx ON events(region_id);

-- RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read approved events"
  ON events FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Service role full access events"
  ON events FOR ALL
  USING (true) WITH CHECK (true);

-- FTS index for event search
CREATE INDEX IF NOT EXISTS events_fts_idx
ON events
USING gin(
  to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(suburb, '') || ' ' ||
    coalesce(state, '') || ' ' ||
    coalesce(category, '') || ' ' ||
    coalesce(location_name, '')
  )
);

-- Search function for events
CREATE OR REPLACE FUNCTION search_events(
  query text DEFAULT NULL,
  state_filter text DEFAULT NULL,
  category_filter text DEFAULT NULL,
  vertical_filter text DEFAULT NULL,
  result_limit int DEFAULT 20,
  result_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  description text,
  start_date date,
  end_date date,
  location_name text,
  suburb text,
  state text,
  lat float8,
  lng float8,
  website_url text,
  ticket_url text,
  image_url text,
  category text,
  verticals text[],
  region_id uuid,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.name, e.slug, e.description,
    e.start_date, e.end_date, e.location_name,
    e.suburb, e.state, e.lat, e.lng,
    e.website_url, e.ticket_url, e.image_url,
    e.category, e.verticals, e.region_id,
    CASE
      WHEN query IS NULL OR query = '' THEN 0.0::real
      ELSE ts_rank(
        to_tsvector('english',
          coalesce(e.name, '') || ' ' ||
          coalesce(e.description, '') || ' ' ||
          coalesce(e.suburb, '') || ' ' ||
          coalesce(e.state, '') || ' ' ||
          coalesce(e.category, '') || ' ' ||
          coalesce(e.location_name, '')
        ),
        websearch_to_tsquery('english', query)
      )
    END AS rank
  FROM events e
  WHERE e.status = 'approved'
  AND e.end_date >= CURRENT_DATE
  AND (
    query IS NULL OR query = '' OR
    to_tsvector('english',
      coalesce(e.name, '') || ' ' ||
      coalesce(e.description, '') || ' ' ||
      coalesce(e.suburb, '') || ' ' ||
      coalesce(e.state, '') || ' ' ||
      coalesce(e.category, '') || ' ' ||
      coalesce(e.location_name, '')
    ) @@ websearch_to_tsquery('english', query)
  )
  AND (state_filter IS NULL OR e.state = state_filter)
  AND (category_filter IS NULL OR e.category = category_filter)
  AND (vertical_filter IS NULL OR vertical_filter = ANY(e.verticals))
  ORDER BY
    CASE WHEN query IS NULL OR query = '' THEN 0 ELSE 1 END DESC,
    rank DESC,
    e.start_date ASC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
