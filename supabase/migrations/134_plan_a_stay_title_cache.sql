-- Plan-a-Stay v2: title cache
-- Caches LLM-generated trip titles so identical conversation inputs
-- hit the cache instead of paying for a new Haiku call.

CREATE TABLE plan_a_stay_title_cache (
  cache_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('llm', 'template')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plan_a_stay_title_cache_created ON plan_a_stay_title_cache(created_at);
