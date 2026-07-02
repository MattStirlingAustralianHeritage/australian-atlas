-- 206: claim referral codes — operator-shareable Stripe promotion codes.
--
-- Each PAID (tier='standard', status='active') listing claim can carry ONE
-- referral code: a Stripe promotion code (e.g. ATLAS-THREE-BLUE) attached to
-- the shared coupon 'atlas-referral-20' (percent_off 20, duration 'once').
-- Operators hand the code out; a new operator applies it at checkout for 20%
-- off their first year. The code is created LAZILY by lib/referrals.js
-- (ensureReferralCode) the first time the owning operator's dashboard asks for
-- it — this column is the durable record of which Stripe promotion code
-- belongs to which claim, so we never mint duplicates and can credit the
-- referrer when the code is redeemed.
--
-- NOTE: pay-to-win guard — referral codes are a billing/marketing feature
-- only. Nothing here may read into search/map/discover ranking or any
-- visitor-facing ordering.

ALTER TABLE listing_claims
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- A promotion code identifies exactly one claim (the referrer to credit).
-- Partial: most claims (free tier, never-asked) carry NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_claims_referral_code
  ON listing_claims (referral_code)
  WHERE referral_code IS NOT NULL;

-- RLS: unchanged. Migration 140 already enables RLS with owner-read-own and
-- service-role-only writes; the new column inherits that posture.

-- Make PostgREST pick up the new column immediately.
NOTIFY pgrst, 'reload schema';
