-- Allow 'hidden' as a valid listing status.
-- The Listing Editor and Listings Review use status='hidden' to hide listings
-- from public view while preserving them in the admin panel.
-- The original CHECK constraint (migration 002) only allowed: active, inactive, pending.

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'inactive', 'pending', 'hidden'));
