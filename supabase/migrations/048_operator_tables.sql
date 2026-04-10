-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 048: Operator product tables
-- ============================================================

-- ── operator_accounts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_accounts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name          TEXT NOT NULL,
  slug                   TEXT UNIQUE NOT NULL,
  contact_name           TEXT NOT NULL,
  contact_email          TEXT UNIQUE NOT NULL,
  contact_phone          TEXT,
  website                TEXT,
  logo_url               TEXT,
  description            TEXT,
  operator_type          TEXT CHECK (operator_type IN (
                           'day_tour', 'multi_day', 'inbound_agency', 'travel_designer', 'other'
                         )),
  tier                   TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'pro')),
  status                 TEXT NOT NULL DEFAULT 'trial' CHECK (status IN (
                           'active', 'suspended', 'cancelled', 'trial', 'past_due'
                         )),
  approved               BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  billing_cycle_start    TIMESTAMPTZ,
  billing_cycle_end      TIMESTAMPTZ,
  team_members           JSONB DEFAULT '[]',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_accounts_user_id ON operator_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_operator_accounts_status ON operator_accounts(status);
ALTER TABLE operator_accounts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER operator_accounts_updated_at
  BEFORE UPDATE ON operator_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── operator_collections ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_collections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id   UUID NOT NULL REFERENCES operator_accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  region        TEXT,
  listing_ids   UUID[] NOT NULL DEFAULT '{}',
  listing_order JSONB DEFAULT '[]',
  is_public     BOOLEAN NOT NULL DEFAULT false,
  share_token   TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_collections_operator ON operator_collections(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_collections_share_token ON operator_collections(share_token);
ALTER TABLE operator_collections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER operator_collections_updated_at
  BEFORE UPDATE ON operator_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── operator_trails ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_trails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id   UUID NOT NULL REFERENCES operator_accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  days          INTEGER NOT NULL DEFAULT 1,
  region        TEXT,
  trail_data    JSONB NOT NULL DEFAULT '{}',
  share_token   TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_public     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_trails_operator ON operator_trails(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_trails_share_token ON operator_trails(share_token);
ALTER TABLE operator_trails ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER operator_trails_updated_at
  BEFORE UPDATE ON operator_trails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── operator_activity ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operator_accounts(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_activity_operator ON operator_activity(operator_id);
ALTER TABLE operator_activity ENABLE ROW LEVEL SECURITY;
