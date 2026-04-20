-- ============================================================
-- 085: Plan Conversations — shareable AI concierge sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code            TEXT UNIQUE NOT NULL,
  title                 TEXT,
  messages              JSONB NOT NULL DEFAULT '[]',
  venue_ids             UUID[] DEFAULT '{}',
  regions               TEXT[] DEFAULT '{}',
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_conversations_short_code ON plan_conversations (short_code);
CREATE INDEX IF NOT EXISTS idx_plan_conversations_created_at ON plan_conversations (created_at DESC);
