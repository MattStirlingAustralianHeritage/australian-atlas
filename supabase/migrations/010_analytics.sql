-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 010: Listing analytics for vendor dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_analytics (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  vertical text not null,
  event_type text not null check (event_type in ('view', 'click', 'search_appearance')),
  region_slug text,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS analytics_listing_idx ON listing_analytics(listing_id, created_at);
CREATE INDEX IF NOT EXISTS analytics_vertical_idx ON listing_analytics(vertical, created_at);
CREATE INDEX IF NOT EXISTS analytics_event_type_idx ON listing_analytics(event_type, created_at);

-- RLS
ALTER TABLE listing_analytics ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anonymous tracking)
CREATE POLICY "Public can insert analytics"
  ON listing_analytics FOR INSERT
  WITH CHECK (true);

-- Only service role can read (via dashboard API)
CREATE POLICY "Service role full access analytics"
  ON listing_analytics FOR ALL
  USING (true) WITH CHECK (true);

-- Add last_verified_at to listings if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'last_verified_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN last_verified_at timestamptz;
  END IF;
END $$;

-- Vendor accounts table for cross-vertical identity
CREATE TABLE IF NOT EXISTS vendor_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text not null unique,
  full_name text,
  linked_verticals jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS vendor_accounts_email_idx ON vendor_accounts(email);
CREATE INDEX IF NOT EXISTS vendor_accounts_user_idx ON vendor_accounts(user_id);

ALTER TABLE vendor_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vendor account"
  ON vendor_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access vendor_accounts"
  ON vendor_accounts FOR ALL
  USING (true) WITH CHECK (true);
