-- 182: Analytics — make pageviews.is_bot self-correcting + final corrective backfill
--
-- Context: migration 141 added pageviews.is_bot/user_agent and the aggregation RPCs;
-- 178 added the user-agent classifier (is_bot_ua) and a corrective backfill. Both
-- backfills ran ONCE. During the 178 rollout window (2026-06-19 13:31 → 06-20 08:45)
-- ~85 datacenter / null-geo pageviews were written with is_bot=false AFTER 178's
-- backfill had already run, so nothing ever corrected them — Singapore / Ashburn /
-- Dallas resurfaced as "human" top visitor-origins in the admin dashboard and the
-- council region metrics, the exact regression 178 set out to kill.
--
-- Root cause is structural, not a one-off: is_bot is only ever as correct as the
-- write path that happened to set it, and a one-time backfill cannot catch rows
-- written after it runs. A deploy gap, a new/forgetful write path, or a manual
-- insert re-opens the leak every time.
--
-- This migration closes the class of bug:
--   1. is_bot_geo(country, city) — the datacenter / null-geo rule as a single SQL
--      function (previously duplicated inline in 141 §2 and 178 §2b).
--   2. A BEFORE INSERT trigger derives is_bot in the database from the row's own
--      user_agent + geo, so EVERY write path — portal /api/track, vertical
--      /api/analytics/ingest, future code, manual inserts — is tagged consistently.
--      No app path can forget; no future deploy gap can leak.
--   3. A final idempotent corrective backfill flags the rows already leaked.
--
-- Discipline unchanged from 141/178: FLAG, never unflag, never delete. The trigger
-- is monotonic (is_bot only ever goes false→true), so a caller that already knows a
-- row is a bot is always honoured. Rows stay queryable; they are only excluded from
-- human-facing analytics. The going-forward app write path still sets is_bot itself
-- (defence in depth + correct behaviour on a DB without this trigger).

-- 1) Geo bot rule as a function (canonical SQL source of truth) ----------------
-- Mirrors isBotRow() in lib/analytics/aggregate.js: a non-AU origin with no resolved
-- city (null-geo — covers null-country and cloud regions geo-IP resolves to a
-- country only, e.g. AWS Singapore as country=SG / city=null) or a known datacenter
-- city. AU traffic is never flagged, including AU rows with no city.
CREATE OR REPLACE FUNCTION is_bot_geo(p_country text, p_city text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_country IS DISTINCT FROM 'AU'
    AND (
      p_city IS NULL
      OR btrim(p_city) = ''
      OR btrim(p_city) IN (
        'Singapore', 'Ashburn', 'Council Bluffs', 'Dallas', 'Dublin',
        'The Dalles', 'Boardman'
      )
    );
$$;

-- 2) Self-correcting trigger: is_bot := is_bot OR UA-rule OR geo-rule -----------
CREATE OR REPLACE FUNCTION pageviews_tag_is_bot()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_bot := COALESCE(NEW.is_bot, false)
    OR is_bot_ua(NEW.user_agent)
    OR is_bot_geo(NEW.country, NEW.city);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pageviews_tag_is_bot_trg ON pageviews;
CREATE TRIGGER pageviews_tag_is_bot_trg
  BEFORE INSERT ON pageviews
  FOR EACH ROW EXECUTE FUNCTION pageviews_tag_is_bot();

-- 3) Final corrective backfill (idempotent, flag-only) -------------------------
-- Fixes the rows leaked in the 178 deploy gap. Identical predicate to the trigger;
-- re-running is a no-op once everything is flagged.
UPDATE pageviews
SET is_bot = true
WHERE is_bot = false
  AND (is_bot_ua(user_agent) OR is_bot_geo(country, city));

-- 4) Grants: pure helper, allow the service role to call it --------------------
REVOKE EXECUTE ON FUNCTION is_bot_geo(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_bot_geo(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
