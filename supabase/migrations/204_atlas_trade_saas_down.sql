-- ============================================================
-- Migration 204 DOWN — Atlas Trade SaaS layer rollback
-- Reverses 204_atlas_trade_saas.sql completely. Safe order:
-- triggers → tables → columns.
-- ============================================================

drop trigger if exists trg_trade_enquiries_touch on public.trade_enquiries;
drop trigger if exists trg_trade_shortlists_touch on public.trade_shortlists;
drop trigger if exists trg_listing_trade_profiles_touch on public.listing_trade_profiles;
drop function if exists public.touch_trade_saas_updated_at();

drop table if exists public.trade_enquiries;
drop table if exists public.trade_shortlist_items;
drop table if exists public.trade_shortlists;
drop table if exists public.listing_trade_profiles;

alter table public.trade_accounts
  drop column if exists org_website,
  drop column if exists org_logo_url,
  drop column if exists focus_regions;

alter table public.trade_itineraries
  drop column if exists client_name,
  drop column if exists cover_note;

alter table public.trade_itinerary_stops
  drop column if exists day,
  drop column if exists time_hint;
