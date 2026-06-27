-- Migration 189: Operator-suggested trails
--
-- A claimed + PAID operator may author ONE "suggested trail" scoped to their
-- listing's region, published on their own listing page only (vertical site +
-- aggregator). Built on the canonical trails / trail_stops store as a new
-- type = 'operator' — deliberately distinct from Atlas-authored editorial
-- region trails (type = 'editorial') and community user trails (type = 'user').
--
-- Because every trail-discovery surface filters to type IN ('editorial','user')
-- (the /trails index, /trails/[slug] detail, region cards), an operator trail
-- never leaks into discovery: it surfaces ONLY on its own listing's detail page.
--
-- This migration is additive + reversible: it widens a CHECK, adds one nullable
-- column + indexes, and creates two read-only curated views. No data is dropped.
--
-- DOWN (manual):
--   drop view if exists operator_trail_stops_public;
--   drop view if exists operator_trails_public;
--   drop index if exists trails_operator_listing_idx;
--   drop index if exists uniq_operator_trail_per_listing;
--   alter table trails drop column if exists listing_id;
--   alter table trails drop constraint if exists trails_type_check;
--   alter table trails add constraint trails_type_check
--     check (type in ('editorial','user'));

begin;

-- ── 1. Allow type = 'operator' on trails ─────────────────────────────────────
alter table trails drop constraint if exists trails_type_check;
alter table trails add constraint trails_type_check
  check (type in ('editorial', 'user', 'operator'));

-- ── 2. Authoring listing — the operator listing this trail is published on ────
alter table trails
  add column if not exists listing_id uuid references listings(id) on delete cascade;

-- One suggested trail per operator listing (partial — only constrains operators).
create unique index if not exists uniq_operator_trail_per_listing
  on trails (listing_id) where type = 'operator';
create index if not exists trails_operator_listing_idx
  on trails (listing_id) where type = 'operator';

-- ── 3. Curated anon-readable views (safe columns; PUBLISHED operator trails) ──
-- The vertical sites read all portal enrichment (events, producer picks, …) via
-- the portal ANON key. The base trails / trail_stops tables are RLS-locked
-- (admin-served) and carry created_by, so — exactly per the events precedent in
-- migration 171 ("expose a curated view of safe columns instead of opening the
-- base table") — we publish a curated VIEW for PUBLISHED operator trails.
--
-- The views run with the owner's rights (security_invoker = off), so anon reads
-- only these curated rows; the base tables stay locked to anon. Stops resolve
-- LIVE against listings (name / slug / image / coords), so the render stays
-- fresh and a de-activated stop simply drops out.

create or replace view operator_trails_public
with (security_invoker = off) as
  select t.id,
         t.listing_id,
         t.slug,
         t.title,
         t.intro,
         t.description,
         t.region_id,
         t.region,
         t.stop_count,
         t.vertical_mix,
         t.updated_at
  from trails t
  where t.type = 'operator'
    and t.visibility = 'public';

create or replace view operator_trail_stops_public
with (security_invoker = off) as
  select ts.trail_id,
         ts.position,
         ts.editorial_copy,
         l.id              as listing_id,
         l.name            as venue_name,
         l.slug            as venue_slug,
         l.vertical,
         l.sub_type,
         l.lat             as venue_lat,
         l.lng             as venue_lng,
         l.hero_image_url  as venue_image_url
  from trail_stops ts
  join trails   t on t.id = ts.trail_id
  join listings l on l.id = ts.listing_id
  where t.type = 'operator'
    and t.visibility = 'public'
    and l.status = 'active';

-- These views run as their owner (security_invoker = off) so a write through an
-- auto-updatable view would hit the base table bypassing RLS. Supabase's default
-- privileges hand anon/authenticated full DML on new public objects, so we must
-- strip everything back to read-only here. SELECT only; service_role keeps full
-- access (server-side, and bypasses RLS regardless).
revoke all    on operator_trails_public      from anon, authenticated;
revoke all    on operator_trail_stops_public from anon, authenticated;
grant  select on operator_trails_public      to   anon, authenticated;
grant  select on operator_trail_stops_public to   anon, authenticated;

commit;

notify pgrst, 'reload schema';
