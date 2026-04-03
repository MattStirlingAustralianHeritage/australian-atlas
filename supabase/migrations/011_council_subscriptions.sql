-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 011: Council & Tourism Body Subscriptions
-- ============================================================

-- Council accounts (organisations, not individual users)
CREATE TABLE IF NOT EXISTS council_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                          -- e.g. "Yarra Ranges Council"
  slug            text not null unique,                   -- e.g. "yarra-ranges-council"
  contact_name    text,
  contact_email   text not null unique,
  contact_phone   text,
  logo_url        text,
  tier            text not null default 'explorer'
                  check (tier in ('explorer', 'partner', 'enterprise')),
  status          text not null default 'active'
                  check (status in ('active', 'suspended', 'cancelled', 'trial')),
  -- Stripe fields (populated when Stripe is wired up)
  stripe_customer_id    text,
  stripe_subscription_id text,
  -- Billing
  billing_cycle_start   timestamptz,
  billing_cycle_end     timestamptz,
  -- Auth
  magic_link_token      text,
  magic_link_expires_at timestamptz,
  last_login_at         timestamptz,
  -- Timestamps
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

CREATE INDEX IF NOT EXISTS council_accounts_email_idx ON council_accounts(contact_email);
CREATE INDEX IF NOT EXISTS council_accounts_slug_idx ON council_accounts(slug);
CREATE INDEX IF NOT EXISTS council_accounts_tier_idx ON council_accounts(tier);

-- Junction: which regions does this council manage?
CREATE TABLE IF NOT EXISTS council_regions (
  id              uuid primary key default gen_random_uuid(),
  council_id      uuid not null references council_accounts(id) on delete cascade,
  region_id       uuid not null references regions(id) on delete cascade,
  role            text not null default 'manager'
                  check (role in ('manager', 'viewer')),
  created_at      timestamptz default now(),
  unique(council_id, region_id)
);

CREATE INDEX IF NOT EXISTS council_regions_council_idx ON council_regions(council_id);
CREATE INDEX IF NOT EXISTS council_regions_region_idx ON council_regions(region_id);

-- Council content: co-created editorial, itineraries, picks
CREATE TABLE IF NOT EXISTS council_content (
  id              uuid primary key default gen_random_uuid(),
  council_id      uuid not null references council_accounts(id) on delete cascade,
  region_id       uuid references regions(id),
  content_type    text not null check (content_type in ('itinerary', 'editorial', 'pick', 'event')),
  title           text not null,
  body            text,
  metadata        jsonb default '{}',
  status          text not null default 'draft'
                  check (status in ('draft', 'published', 'archived')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

CREATE INDEX IF NOT EXISTS council_content_council_idx ON council_content(council_id);
CREATE INDEX IF NOT EXISTS council_content_region_idx ON council_content(region_id);

-- Council activity log
CREATE TABLE IF NOT EXISTS council_activity (
  id              uuid primary key default gen_random_uuid(),
  council_id      uuid not null references council_accounts(id) on delete cascade,
  action          text not null,   -- e.g. 'login', 'view_report', 'create_content'
  metadata        jsonb default '{}',
  created_at      timestamptz default now()
);

CREATE INDEX IF NOT EXISTS council_activity_council_idx ON council_activity(council_id, created_at);

-- Triggers
CREATE TRIGGER council_accounts_updated_at
  BEFORE UPDATE ON council_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER council_content_updated_at
  BEFORE UPDATE ON council_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE council_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE council_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE council_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE council_activity ENABLE ROW LEVEL SECURITY;

-- Service role full access (for API routes)
CREATE POLICY "Service role full access council_accounts"
  ON council_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access council_regions"
  ON council_regions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access council_content"
  ON council_content FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access council_activity"
  ON council_activity FOR ALL USING (true) WITH CHECK (true);

-- Tier configuration reference (not a table, just documentation)
-- Explorer: $249/year  — 1 region, view listing data, basic region report
-- Partner:  $3,500/year — 1 region, analytics, content co-creation, listing management
-- Enterprise: $8,500/year — Multiple regions, full analytics, API access, white-label reports
