-- Plan-a-Stay v2: trip persistence
-- Stores assembled trips for sharing and history.

CREATE TABLE plan_a_stay_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_slug TEXT UNIQUE NOT NULL,
  answers JSONB NOT NULL,
  retrieval JSONB NOT NULL,
  trip JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  is_public BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_plan_a_stay_trips_share ON plan_a_stay_trips(share_slug);
CREATE INDEX idx_plan_a_stay_trips_user ON plan_a_stay_trips(user_id);
