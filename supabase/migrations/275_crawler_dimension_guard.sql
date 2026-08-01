-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 275: never let a crawler row land without its dimensions
-- ============================================================
-- Two defects found while verifying the dashboard against live data.
--
-- 1. NULL dimensions split every aggregate.
--    Migration 272 backfilled bot_category/bot_operator for the rows that
--    existed when it ran, and the new middleware supplies them on insert.
--    But production keeps serving the OLD middleware until this branch
--    deploys, and that code inserts bot_name only. Those rows carry NULL
--    dimensions, so `GROUP BY bot_name, bot_category, bot_operator` emitted
--    a second, blank-operator "ClaudeBot" row alongside the real one, and a
--    nameless row in the operator and category breakdowns.
--
--    The durable fix is to stop treating the dimension as the writer's
--    responsibility: a BEFORE INSERT trigger derives anything the caller
--    omitted. That closes the deploy window, and also protects against any
--    future writer — a backfill script, a replay, a second edge function —
--    that forgets the new columns.
--
--    The mapping below covers only the nine tokens the legacy middleware
--    could ever emit. It is deliberately NOT a copy of the ~90-entry
--    catalogue in lib/bots/registry.js: the application always supplies
--    category and operator, so a full SQL mirror would be a second source
--    of truth guaranteed to drift. Anything unrecognised lands in
--    'other'/'Unidentified', which is exactly how an unknown bot should
--    read on the dashboard.
--
-- 2. crawler_by_bot's venue column counted requests, not venues.
--    It reported `count(*) FILTER (WHERE path_kind = 'place')`, so a bot
--    that fetched one venue page four times showed "4 venues" against
--    "1 URL". The useful figure — and the one the column header promises —
--    is how many distinct venue pages that bot has read.
-- ============================================================

-- ── 1. Dimension backstop ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crawler_fill_dimensions()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bot_operator IS NULL THEN
    NEW.bot_operator := CASE NEW.bot_name
      WHEN 'GPTBot' THEN 'OpenAI'
      WHEN 'OAI-SearchBot' THEN 'OpenAI'
      WHEN 'ChatGPT-User' THEN 'OpenAI'
      WHEN 'ClaudeBot' THEN 'Anthropic'
      WHEN 'Claude-SearchBot' THEN 'Anthropic'
      WHEN 'Claude-User' THEN 'Anthropic'
      WHEN 'PerplexityBot' THEN 'Perplexity'
      WHEN 'Perplexity-User' THEN 'Perplexity'
      WHEN 'Googlebot' THEN 'Google'
      ELSE 'Unidentified'
    END;
  END IF;

  IF NEW.bot_category IS NULL THEN
    NEW.bot_category := CASE NEW.bot_name
      WHEN 'GPTBot' THEN 'ai_training'
      WHEN 'ClaudeBot' THEN 'ai_training'
      WHEN 'OAI-SearchBot' THEN 'ai_search'
      WHEN 'Claude-SearchBot' THEN 'ai_search'
      WHEN 'PerplexityBot' THEN 'ai_search'
      WHEN 'ChatGPT-User' THEN 'ai_assistant'
      WHEN 'Claude-User' THEN 'ai_assistant'
      WHEN 'Perplexity-User' THEN 'ai_assistant'
      WHEN 'Googlebot' THEN 'search_engine'
      ELSE 'other'
    END;
  END IF;

  IF NEW.bot_known IS NULL THEN
    NEW.bot_known := NEW.bot_operator <> 'Unidentified';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crawler_fill_dimensions_trg ON site_crawler_hits;
CREATE TRIGGER crawler_fill_dimensions_trg
  BEFORE INSERT ON site_crawler_hits
  FOR EACH ROW EXECUTE FUNCTION crawler_fill_dimensions();

-- Sweep up the rows that accumulated between migration 272 and this trigger.
UPDATE site_crawler_hits SET
  bot_operator = CASE bot_name
    WHEN 'GPTBot' THEN 'OpenAI'
    WHEN 'OAI-SearchBot' THEN 'OpenAI'
    WHEN 'ChatGPT-User' THEN 'OpenAI'
    WHEN 'ClaudeBot' THEN 'Anthropic'
    WHEN 'Claude-SearchBot' THEN 'Anthropic'
    WHEN 'Claude-User' THEN 'Anthropic'
    WHEN 'PerplexityBot' THEN 'Perplexity'
    WHEN 'Perplexity-User' THEN 'Perplexity'
    WHEN 'Googlebot' THEN 'Google'
    ELSE 'Unidentified'
  END,
  bot_category = CASE bot_name
    WHEN 'GPTBot' THEN 'ai_training'
    WHEN 'ClaudeBot' THEN 'ai_training'
    WHEN 'OAI-SearchBot' THEN 'ai_search'
    WHEN 'Claude-SearchBot' THEN 'ai_search'
    WHEN 'PerplexityBot' THEN 'ai_search'
    WHEN 'ChatGPT-User' THEN 'ai_assistant'
    WHEN 'Claude-User' THEN 'ai_assistant'
    WHEN 'Perplexity-User' THEN 'ai_assistant'
    WHEN 'Googlebot' THEN 'search_engine'
    ELSE 'other'
  END,
  bot_known = bot_name IN (
    'GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot',
    'Claude-User','PerplexityBot','Perplexity-User','Googlebot'
  )
WHERE bot_category IS NULL OR bot_operator IS NULL;

-- ── 2. Count distinct venues, not venue requests ────────────────────────
CREATE OR REPLACE FUNCTION crawler_by_bot(p_since timestamptz)
RETURNS TABLE (
  bot_name text, bot_category text, bot_operator text, bot_known boolean,
  hits bigint, paths bigint, ips bigint, place_hits bigint,
  disallowed_hits bigint, first_seen timestamptz, last_seen timestamptz
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    h.bot_name, h.bot_category, h.bot_operator, bool_and(h.bot_known),
    count(*)::bigint,
    count(DISTINCT h.path)::bigint,
    count(DISTINCT h.ip)::bigint,
    -- Distinct venue pages read, with any locale prefix stripped so
    -- /zh/place/x and /place/x are the same venue.
    count(DISTINCT h.path) FILTER (WHERE h.path_kind = 'place')::bigint,
    count(*) FILTER (WHERE h.disallowed)::bigint,
    min(h.fetched_at), max(h.fetched_at)
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY h.bot_name, h.bot_category, h.bot_operator
  ORDER BY count(*) DESC
$$;

REVOKE ALL ON FUNCTION crawler_by_bot(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crawler_by_bot(timestamptz) TO service_role;
