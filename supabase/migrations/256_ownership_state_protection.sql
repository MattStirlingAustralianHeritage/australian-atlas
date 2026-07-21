-- 256: ownership state protection — enforce the listing_claims invariant at
-- the database layer, so no code path can ever recreate the 2026-07-21
-- incident class.
--
-- Incident: the nightly sync re-derived listings.is_claimed from vertical
-- claim flags and silently un-claimed 27 of 28 operator-owned listings;
-- every affected operator lost dashboard access, for up to four weeks,
-- undetected until an operator complained. Application-layer guards now
-- exist (syncSourceRows claim guard + updateListing push-down, commit
-- 4b5f247), but application guards can be bypassed by new code, ad-hoc
-- scripts, or human SQL. This migration makes the invariant unbreakable at
-- the source, following the protect_article_body precedent.
--
-- Invariant enforced (one direction, matching grantClaim's contract):
--   a listing with a LIVE ownership claim — listing_claims.status IN
--   ('active','past_due') — always has is_claimed = true, and cannot be
--   deleted (listing_claims.listing_id is ON DELETE CASCADE; deleting the
--   listing would silently destroy the ownership row).
--
-- The reverse direction (is_claimed = true requires a claim row) is NOT
-- enforced: vertical-originated claims legitimately arrive via sync with no
-- portal listing_claims row.
--
-- Interplay with existing flows (verified):
--   * Stripe cancel webhook: sets the claim status 'inactive' FIRST, then
--     clears is_claimed — by then no live claim exists, so the clear passes.
--   * Nightly sync bulk upserts: the coerce trigger silently repairs the
--     value instead of raising, so a sync run can never fail on this.
--   * Admin gate-check Hide: sets status, not deleted — unaffected.
--   * Admin gate-check Delete on an owned listing: now errors with an
--     instruction to deactivate the claim first. That friction is the point.

-- Helper: does this listing carry a live ownership claim?
CREATE OR REPLACE FUNCTION listing_has_live_claim(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM listing_claims
    WHERE listing_id = p_listing_id
      AND status IN ('active', 'past_due')
  )
$$;

-- 1. is_claimed can never go false while a live claim exists. Coerces
--    rather than raises so bulk sync upserts keep succeeding — the write
--    lands with the protected value.
CREATE OR REPLACE FUNCTION protect_owned_listing_claim_flag()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_claimed IS DISTINCT FROM true
     AND listing_has_live_claim(NEW.id) THEN
    NEW.is_claimed := true;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_protect_owned_listing_claim_flag ON listings;
CREATE TRIGGER trg_protect_owned_listing_claim_flag
  BEFORE UPDATE OF is_claimed ON listings
  FOR EACH ROW EXECUTE FUNCTION protect_owned_listing_claim_flag();

-- 2. An owned listing cannot be deleted. The FK cascade would otherwise
--    destroy the listing_claims row with no trace — deactivate the claim
--    first, deliberately, then delete.
CREATE OR REPLACE FUNCTION protect_owned_listing_delete()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF listing_has_live_claim(OLD.id) THEN
    RAISE EXCEPTION 'listing % has a live ownership claim — set the listing_claims row to inactive before deleting', OLD.id;
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS trg_protect_owned_listing_delete ON listings;
CREATE TRIGGER trg_protect_owned_listing_delete
  BEFORE DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION protect_owned_listing_delete();

-- 3. Self-heal on grant: a claim becoming live stamps the display flag, so
--    grant code can never forget it. Deactivation deliberately does NOT
--    auto-clear is_claimed — the cancel flow owns that decision.
CREATE OR REPLACE FUNCTION stamp_listing_on_live_claim()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('active', 'past_due') THEN
    UPDATE listings SET is_claimed = true
    WHERE id = NEW.listing_id AND is_claimed IS DISTINCT FROM true;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_stamp_listing_on_live_claim ON listing_claims;
CREATE TRIGGER trg_stamp_listing_on_live_claim
  AFTER INSERT OR UPDATE OF status ON listing_claims
  FOR EACH ROW EXECUTE FUNCTION stamp_listing_on_live_claim();
