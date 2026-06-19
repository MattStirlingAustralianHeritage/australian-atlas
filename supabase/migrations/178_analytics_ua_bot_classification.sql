-- 178: Analytics — user-agent bot classification + corrective is_bot backfill
--
-- Context: migration 141 added pageviews.is_bot/user_agent and the region-scoped
-- aggregation RPCs (analytics_region_metrics et al.) — all already live in prod.
-- 141's is_bot was geo-only ("non-AU + datacenter-city / null-geo") and ran as a
-- ONE-TIME backfill. Two gaps remained, both visible in the live council numbers
-- (e.g. "Singapore" surfacing as a top visitor-origin for Melbourne):
--
--   1. Bot tagging is the council product's whole point — "a dashboard that counts
--      crawlers as visitors is worse than no dashboard". The spec mandates
--      user-agent pattern detection, which 141 never implemented.
--   2. Rows written AFTER 141's one-time backfill default to is_bot=false. The
--      /api/track path never tagged is_bot at all, so fresh datacenter/null-geo
--      pageviews (e.g. Singapore, Jun 2026) leaked back into "human" traffic.
--
-- This migration adds a UA classifier and re-applies BOTH rules as a corrective,
-- idempotent backfill. It FLAGS, never deletes — rows stay queryable, just
-- excluded from human-facing analytics (same discipline as 141). The going-forward
-- write path (app/api/track + app/api/analytics/ingest) tags is_bot = UA||geo and
-- stores user_agent, so the stored column the RPCs read stays correct for new rows.

-- 1) UA bot classifier --------------------------------------------------------
-- Case-insensitive substring match on common crawler / HTTP-client patterns.
-- MUST stay in sync with BOT_UA_PATTERNS in lib/analytics/aggregate.js (isBotUA).
-- The pattern list is deliberately the spec's list verbatim.
CREATE OR REPLACE FUNCTION is_bot_ua(ua text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT ua IS NOT NULL AND ua ~* (
    'bot|crawl|spider|slurp|googlebot|bingbot|duckduckbot|baiduspider|yandex|' ||
    'ahrefs|semrush|mj12bot|dotbot|headless|lighthouse|python-requests|axios|' ||
    'curl|wget|java/'
  );
$$;

-- 2) Corrective backfill (flag false -> true only; never unflags, never deletes) --

-- 2a) UA rule: any not-yet-flagged row whose stored user_agent is a known crawler.
UPDATE pageviews
SET is_bot = true
WHERE is_bot = false
  AND user_agent IS NOT NULL
  AND is_bot_ua(user_agent);

-- 2b) Re-apply 141's geo rule to rows accumulated since its one-time run. Identical
-- predicate to 141 §2 — non-AU origins with no resolved city (null-geo: covers
-- null-country + cloud regions geo-IP resolves to a country only) or a known
-- datacenter city. AU traffic is never touched. Idempotent: re-running is a no-op.
UPDATE pageviews
SET is_bot = true
WHERE is_bot = false
  AND country IS DISTINCT FROM 'AU'
  AND (
    city IS NULL
    OR btrim(city) = ''
    OR btrim(city) IN (
      'Singapore', 'Ashburn', 'Council Bluffs', 'Dallas', 'Dublin',
      'The Dalles', 'Boardman'
    )
  );

-- 3) Grants: is_bot_ua is a pure helper; allow the service role to call it.
REVOKE EXECUTE ON FUNCTION is_bot_ua(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_bot_ua(text) TO service_role;

NOTIFY pgrst, 'reload schema';
