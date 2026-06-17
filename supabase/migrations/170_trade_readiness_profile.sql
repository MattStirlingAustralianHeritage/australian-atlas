-- ============================================================
-- Australian Atlas Portal — Master DB (small-batch-atlas, ref nyhkcmvhwbydsqsyvizs)
-- Migration 170: Atlas Trade — trade-readiness profile (operator-authored)
-- ============================================================
--
-- Phase 0 of Atlas Trade. Adds an operator-authored "trade readiness" layer to
-- the canonical operator-editable table (`listings`) and the single predicate
-- (`trade_buildable_listings`) that every future trade read path MUST consume.
--
-- WHY `listings` IS THE CANONICAL HOME (verified against the live DB 2026-06-17,
-- see docs/audits/atlas-trade-phase0-findings-2026-06-17.md):
--   - The live commercial pipeline is the CLAIM path: claims live in
--     `listing_claims`; the live Stripe webhook (app/api/stripe/webhook) →
--     grantClaim() writes `listing_claims`; the `operator_accounts` table is a
--     separate, inert product (0 rows).
--   - When a claimed operator edits their listing, app/api/dashboard/listing
--     (PATCH) writes operator-authored fields DIRECTLY onto `listings`
--     (website, phone, hours, operator_highlights jsonb, search_keywords).
--   - Adjacent capacity metadata already lives on `listings`: `visitable`
--     (bool, default true) and `presence_type` (text, default 'permanent').
--     Trade-readiness is adjacent capacity metadata and sits with them.
--
-- CONSENT: every column defaults to the non-participating value. No existing
-- row is silently opted into trade. trade_welcome is the master switch — a
-- listing is never trade-includable unless trade_welcome = true.
--
-- RATES: trade_rates_available is a BOOLEAN ONLY. Atlas never stores or displays
-- the rate value; it records only that the operator offers trade rates.
--
-- MASTER-ONLY / SYNC-SAFE: these columns are never written by the inbound
-- vertical sync (lib/sync/fieldMaps.js), so an inbound sync cannot clobber them
-- (same "safe by omission" contract as listings.hours / operator_highlights).
-- No vertical-DB DDL is required — portal is canonical (Rule 4).
--
-- Additive and non-destructive. Idempotent (IF NOT EXISTS).
-- Rollback: supabase/migrations/170_trade_readiness_profile_down.sql
-- ============================================================

-- ── Section 2: trade-readiness columns on the canonical table ──────────────

alter table public.listings
  add column if not exists trade_welcome                boolean not null default false,
  add column if not exists trade_bespoke                boolean not null default false,
  add column if not exists trade_group                  boolean not null default false,
  add column if not exists trade_group_size_max         integer,
  add column if not exists trade_contact_before_booking boolean not null default false,
  add column if not exists trade_rates_available         boolean not null default false;

comment on column public.listings.trade_welcome is
  'Atlas Trade master switch. Operator-authored. A listing is NOT trade-includable unless this is true. Default false (no silent opt-in).';
comment on column public.listings.trade_bespoke is
  'Welcomes individual / bespoke trade (DMCs, trip designers, private itineraries). Only meaningful when trade_welcome = true.';
comment on column public.listings.trade_group is
  'Welcomes group / volume trade. Only meaningful when trade_welcome = true.';
comment on column public.listings.trade_group_size_max is
  'Group ceiling for trade groups. Only meaningful when trade_group = true. NULL = unspecified.';
comment on column public.listings.trade_contact_before_booking is
  'Operator requires direct contact before any trade inclusion.';
comment on column public.listings.trade_rates_available is
  'Operator offers trade rates. BOOLEAN ONLY — Atlas never stores or displays the rate value.';

-- ── Section 3: the single trade-buildable predicate ────────────────────────
--
-- THE SOLE DEFINITION OF THE TRADE-BUILDABLE POOL. Every future trade read path
-- (trade builder, trade export, trade API) MUST consume this view. Do NOT
-- re-implement the claimed-AND-trade_welcome filter anywhere else.
--
-- Definition: trade-buildable IFF claimed AND trade_welcome = true.
--   "claimed" = an ACTIVE row in `listing_claims` (the ownership source of
--   truth used by the live edit-authz in app/api/dashboard/listing). We do NOT
--   use listings.is_claimed: it is a denormalized mirror that has drifted on
--   prod (6 rows flag is_claimed=true but only 4 have an active claim; e.g.
--   "1813" and "Bindi Wine Growers" carry the flag with no listing_claims row).
--
-- NOT wired into any consumer surface by this migration. The Plan-a-Stay v2
-- planner is consumer-facing (travellers) and must NOT consume this predicate.

create or replace view public.trade_buildable_listings as
  select l.*
  from public.listings l
  where l.trade_welcome = true
    and exists (
      select 1
      from public.listing_claims c
      where c.listing_id = l.id
        and c.status = 'active'
    );

comment on view public.trade_buildable_listings is
  'Atlas Trade — the single source of truth for the trade-buildable listing pool. '
  'Trade-buildable IFF an active listing_claims row exists (canonical claimed signal) '
  'AND listings.trade_welcome = true. ALL trade-facing reads (builder, export, API) '
  'MUST consume this view; never re-implement the filter. NOT for consumer surfaces '
  '(e.g. Plan-a-Stay v2 is traveller-facing and must not use this). Migration 170.';

-- PostgREST schema cache reload (portal convention after DDL).
notify pgrst, 'reload schema';
