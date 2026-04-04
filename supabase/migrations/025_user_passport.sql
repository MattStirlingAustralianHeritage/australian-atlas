-- Atlas Passport — user travel history and identity

-- User visits: self-reported "I've been here" taps
CREATE TABLE IF NOT EXISTS user_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  visited_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX idx_visits_user ON user_visits(user_id);
CREATE INDEX idx_visits_listing ON user_visits(listing_id);

-- User saves: wishlist / saved places
CREATE TABLE IF NOT EXISTS user_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  saved_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX idx_saves_user ON user_saves(user_id);
CREATE INDEX idx_saves_listing ON user_saves(listing_id);

-- User trails: saved trail results
CREATE TABLE IF NOT EXISTS user_trails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  summary text,
  prompt text,
  region text,
  days jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_trails_user ON user_trails(user_id);

-- Regional email digest subscriptions
CREATE TABLE IF NOT EXISTS digest_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  region_slug text NOT NULL,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly')),
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz,
  UNIQUE(email, region_slug)
);

CREATE INDEX idx_digest_region ON digest_subscriptions(region_slug);
CREATE INDEX idx_digest_active ON digest_subscriptions(unsubscribed_at) WHERE unsubscribed_at IS NULL;

-- Editorial story ideas queue
CREATE TABLE IF NOT EXISTS story_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name text,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  vertical text,
  region text,
  story_angle text,
  contact_details text,
  source text DEFAULT 'manual',  -- 'manual', 'council_requested', 'auto_suggested'
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'pitched', 'confirmed', 'in_progress', 'published')),
  notes text,
  target_publish_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_story_ideas_status ON story_ideas(status);
CREATE INDEX idx_story_ideas_vertical ON story_ideas(vertical);

-- Pre-populate Turkey Flat interview
INSERT INTO story_ideas (venue_name, vertical, region, story_angle, status, notes)
VALUES (
  'Turkey Flat Vineyards',
  'sba',
  'Barossa Valley',
  'Producer profile — multi-generational Barossa winery, one of the oldest Shiraz vineyards in Australia',
  'confirmed',
  'Interview scheduled at Turkey Flat. Cover: the family history, the approach to old-vine Shiraz, the relationship between terroir and the Barossa community.'
);
