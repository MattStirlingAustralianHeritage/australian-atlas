-- ============================================================
-- 120_cinema_drive_in_primary_types.sql
--
-- Adds independent cinemas and drive-ins as primary types within
-- the Culture Atlas (collection) vertical, and seeds the major
-- cinema-chain operators as auto-reject entries in
-- commercial_groups.
--
-- Schema impact: NONE on listings.sub_type or vertical-side
-- venues.type — both columns are unconstrained TEXT (see
-- migration 038). The allowed-value list is enforced at the
-- application layer in lib/sync/pushToVertical.js
-- (VERTICAL_CATEGORIES.collection); 'cinema' and 'drive_in' are
-- added there in the same change.
--
-- commercial_groups changes (depends on migration 117 columns
-- vertical_scope, parent_entity, verify_case_by_case, notes):
--
--   1. Insert 5 new cinema-chain groups, scoped to the
--      collection vertical so the auto-reject only fires when
--      evaluating Culture Atlas candidates:
--        - Hoyts Australia      (parent: ID Leisure Ventures)
--        - Village Cinemas      (parent: Village Roadshow / EVT JV)
--        - Dendy Cinemas        (parent: Icon Film Distribution)
--        - Palace Cinemas       (parent: Zeccola family)
--        - Reading Cinemas      (parent: Reading International)
--
--   2. Extend the existing EVT row (currently scoped to hotel
--      accommodation, vertical_scope = NULL/global) with cinema
--      sub-brands and an explicit two-vertical scope. Per the
--      sign-off 2026-05-05, EVT is one operator covering both
--      Rest (hotels) and Collection (cinemas); single row,
--      single source of truth.
--
-- Wallis Cinemas (SA-based, family-owned, ~5 venues) is
-- intentionally NOT inserted — flagged for case-by-case verify
-- in the curation standards rather than auto-rejected.
--
-- Source: editorial decision 2026-05-05 (Cinema and Drive-In
-- expansion of the Culture Atlas vertical).
-- ============================================================

-- ─── 1. Insert cinema-chain auto-reject groups ────────────────────────

insert into commercial_groups (
  group_name, category, brands, vertical_scope, verify_case_by_case, parent_entity, notes
) values
  (
    'Hoyts Australia',
    'cinema',
    array[]::text[],
    array['collection'],
    false,
    'ID Leisure Ventures',
    'Auto-reject all venues. Major chain across capital cities and regional hubs.'
  ),
  (
    'Village Cinemas',
    'cinema',
    array[]::text[],
    array['collection'],
    false,
    'Village Roadshow / EVT JV',
    'Auto-reject all venues. Joint venture between Village Roadshow and EVT.'
  ),
  (
    'Dendy Cinemas',
    'cinema',
    array[]::text[],
    array['collection'],
    false,
    'Icon Film Distribution',
    'Auto-reject all venues.'
  ),
  (
    'Palace Cinemas',
    'cinema',
    array[
      'Como','Westgarth','Cinema Nova','Chauvel',
      'Pentridge','Elsternwick','Classic'
    ],
    array['collection'],
    false,
    'Zeccola family',
    'Auto-reject. 20+ venues with centralised programming and unified Palace Movie Club. Point-of-operation is Palace, not the individual venue. Family-owned does not override the centralised-operations test.'
  ),
  (
    'Reading Cinemas',
    'cinema',
    array[]::text[],
    array['collection'],
    false,
    'Reading International',
    'Auto-reject all venues. ASX/NASDAQ-listed parent.'
  )
on conflict (group_name) do update
  set category            = excluded.category,
      brands              = (
                              select array_agg(distinct b)
                                from unnest(commercial_groups.brands || excluded.brands) as b
                            ),
      vertical_scope      = (
                              select array_agg(distinct v)
                                from unnest(coalesce(commercial_groups.vertical_scope, '{}'::text[]) || excluded.vertical_scope) as v
                            ),
      verify_case_by_case = excluded.verify_case_by_case,
      parent_entity       = coalesce(excluded.parent_entity, commercial_groups.parent_entity),
      notes               = coalesce(excluded.notes,         commercial_groups.notes);


-- ─── 2. Extend EVT to also cover the collection vertical ──────────────
-- EVT (Event Hospitality and Entertainment) operates both hotel
-- accommodation and cinemas. The existing row's brands list only
-- the hotel sub-brands; this update appends the cinema sub-brands
-- and switches vertical_scope from NULL (global) to the explicit
-- {rest, collection} pair so name-matching only fires on those
-- two verticals.

update commercial_groups
   set brands         = (
                          select array_agg(distinct b)
                            from unnest(
                              brands || array[
                                'Event Cinemas',
                                'Greater Union',
                                'BCC',
                                'Birch Carroll & Coyle',
                                'Moonlight Cinema',
                                'Gold Class'
                              ]
                            ) as b
                        ),
       vertical_scope = array['rest','collection'],
       notes          = 'EVT (Event Hospitality and Entertainment) operates both hotel accommodation (Rydges, QT, Atura, Ode, EVT Stays) and cinemas (Event, Greater Union, BCC, Moonlight, Gold Class). Auto-reject across both verticals.',
       source         = '01-independence-criteria.md (snapshot 2026-05-05; cinema sub-brands added)'
 where group_name = 'EVT';
