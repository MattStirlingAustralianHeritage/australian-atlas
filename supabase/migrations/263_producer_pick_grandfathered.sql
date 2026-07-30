-- 263: grandfather the producer picks that predate the paid gate.
--
-- Producer's Picks are a Standard-tier perk. The dashboard editor has always
-- rendered the picks panel as locked for an unpaid listing, but the server
-- never enforced it: POST /api/dashboard/picks checked ownership only, so a
-- free-claim operator holding a valid token could write picks directly. This
-- migration is the data half of closing that hole; the gate itself lives in
-- app/api/dashboard/picks/route.js and lib/picks/producerPicks.js.
--
-- Picks are stored in `listing_relationships` with relationship_type =
-- 'producer_pick' (there is no separate picks table, and that type is
-- currently the table's only inhabitant).
--
-- Semantics of the new column, read at RENDER time on /place/[slug]:
--
--   grandfathered = true   → the pick renders whatever tier its curator is on
--   grandfathered = false  → the pick renders only while its curator holds a
--                            live standard claim (isListingPaid)
--
-- Two populations get true:
--   1. Every row existing when this ran. Picks already published stay live —
--      we are closing a hole, not retracting work operators can see today.
--   2. Rows written afterwards by an ADMIN through
--      /api/admin/listings/[id]/picks. Editorial curation is a deliberate
--      network-staff act, and admins bypass the paid gate everywhere else in
--      this codebase (see `user.role === 'admin' || await isListingPaid(...)`
--      in app/api/dashboard/listing/route.js). Without the exemption an
--      admin-added "picked by" would insert successfully and then silently
--      fail to render.
--
-- Operator self-service picks written from here on are false, and their
-- creation requires a live standard claim — so a false row can only ever be
-- one whose curator has LAPSED since creating it. That is exactly the case
-- the render filter is there to catch.
--
-- NOT NULL DEFAULT false is the fail-closed default: any future caller that
-- forgets the column produces a gated pick, never an exempt one.

ALTER TABLE listing_relationships
  ADD COLUMN IF NOT EXISTS grandfathered boolean NOT NULL DEFAULT false;

-- Backfill: everything that already exists is grandfathered.
UPDATE listing_relationships
   SET grandfathered = true
 WHERE grandfathered = false;

COMMENT ON COLUMN listing_relationships.grandfathered IS
  'Producer picks only: true = exempt from the paid-curator render gate (pre-dates the gate, or admin editorial). false = renders only while the curator holds a live standard claim.';
