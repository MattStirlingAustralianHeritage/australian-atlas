-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 013: Unified profiles table with role system
-- ============================================================
-- Replaces the implicit role system with an explicit profiles table.
-- This is the single source of identity for the Atlas Network.
-- Role travels in the shared JWT so verticals can gate access.
-- ============================================================

-- Profiles table — one row per authenticated user
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  role            text not null default 'user'
                  check (role in ('user', 'vendor', 'council', 'admin')),
  -- Council-specific: links to council_accounts for council role users
  council_id      uuid references council_accounts(id) on delete set null,
  -- Vendor-specific: which verticals this vendor has claimed on
  -- e.g. {"sba": true, "craft": true}
  vendor_verticals jsonb default '{}',
  -- Stripe (for vendors — primary customer ID across network)
  stripe_customer_id text,
  -- Timestamps
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
CREATE INDEX IF NOT EXISTS profiles_council_idx ON profiles(council_id) WHERE council_id IS NOT NULL;

-- Auto-update updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but not role — that's service-role only)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access profiles"
  ON profiles FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- Auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'user'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), profiles.avatar_url),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Migrate existing vendor_accounts into profiles
-- ============================================================
-- Any existing vendor_accounts rows become profiles with role='vendor'
INSERT INTO profiles (id, email, full_name, role, vendor_verticals, created_at, updated_at)
SELECT
  va.user_id,
  va.email,
  va.full_name,
  'vendor',
  COALESCE(va.linked_verticals, '{}'),
  va.created_at,
  va.updated_at
FROM vendor_accounts va
ON CONFLICT (id) DO UPDATE SET
  role = 'vendor',
  vendor_verticals = COALESCE(EXCLUDED.vendor_verticals, profiles.vendor_verticals),
  updated_at = now();

-- ============================================================
-- Backfill: create profiles for any existing auth.users without one
-- ============================================================
INSERT INTO profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  'user'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
