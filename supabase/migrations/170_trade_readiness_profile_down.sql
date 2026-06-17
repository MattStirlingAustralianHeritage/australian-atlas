-- ============================================================
-- Australian Atlas Portal — Master DB (small-batch-atlas, ref nyhkcmvhwbydsqsyvizs)
-- Migration 170 — DOWN / ROLLBACK
-- Reverses 170_trade_readiness_profile.sql.
-- ============================================================
--
-- Drops the trade-buildable predicate first (it depends on trade_welcome),
-- then the six trade-readiness columns. Idempotent (IF EXISTS).
--
-- Run with:
--   node scripts/run-migration.mjs supabase/migrations/170_trade_readiness_profile_down.sql
-- ============================================================

drop view if exists public.trade_buildable_listings;

alter table public.listings
  drop column if exists trade_welcome,
  drop column if exists trade_bespoke,
  drop column if exists trade_group,
  drop column if exists trade_group_size_max,
  drop column if exists trade_contact_before_booking,
  drop column if exists trade_rates_available;

notify pgrst, 'reload schema';
