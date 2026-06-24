-- ============================================================
-- Rollback for migration 184 — Atlas Trade itineraries + accounts
-- ============================================================
-- Drops the three trade tables (and their policies/indexes via cascade).
-- Does NOT touch the migration-170 trade_* columns / trade_buildable_listings view.
-- ============================================================

drop table if exists public.trade_itinerary_stops cascade;
drop table if exists public.trade_itineraries cascade;
drop table if exists public.trade_accounts cascade;

notify pgrst, 'reload schema';
