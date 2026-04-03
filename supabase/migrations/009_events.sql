-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 009: Events table for paid event listings
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
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
