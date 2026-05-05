-- ============================================================
-- 117_commercial_groups_vertical_scope.sql
--
-- Add vertical_scope and verify_case_by_case columns to
-- commercial_groups, and seed the Way Atlas experience-tourism
-- group operators per Way Atlas Specification Section II
-- (May 2026).
--
-- Architectural decision (sign-off 2026-05-02): the spec calls
-- for a separate `known_experience_groups` table. The
-- architectural clarification is to extend the existing
-- `commercial_groups` table instead — keeps independence
-- evaluation single-source.
--
-- Schema additions:
--   • vertical_scope TEXT[] — NULL or empty array means
--     "applies globally" (existing behaviour preserved). A
--     populated array means "applies only when evaluating
--     listings on the named verticals." Way's experience
--     groups insert with vertical_scope = ARRAY['way'] so the
--     auto-reject doesn't fire on the same operator's
--     accommodation listings on Rest, etc.
--   • verify_case_by_case BOOLEAN — when true, the group
--     surfaces in candidate review as "manual review required"
--     rather than auto-reject. Used for Voyages Indigenous
--     Tourism (Spec §II): owned by ILSC but operates as a
--     commercial group; some sub-brands are genuinely
--     community-rooted, others are commercial product with
--     Aboriginal branding.
--
-- Existing rows keep vertical_scope = NULL (global) and
-- verify_case_by_case = false (auto-reject), preserving the
-- pre-migration behaviour exactly.
-- ============================================================

alter table commercial_groups
  add column if not exists vertical_scope       text[],
  add column if not exists verify_case_by_case  boolean not null default false,
  add column if not exists parent_entity        text,
  add column if not exists domains              text[] not null default '{}'::text[],
  add column if not exists notes                text;

-- GIN index for vertical_scope membership queries
-- (commercial_groups WHERE 'way' = ANY(vertical_scope) OR vertical_scope IS NULL).
create index if not exists commercial_groups_vertical_scope_gin
  on commercial_groups using gin (vertical_scope);

create index if not exists commercial_groups_verify_idx
  on commercial_groups (verify_case_by_case)
  where verify_case_by_case = true;


-- ─── Seed: Way Atlas experience-tourism groups ────────────────────────
-- Source: Way Atlas Specification Section II (snapshot May 2026).
-- All inserted with vertical_scope = ARRAY['way'] so auto-reject
-- only fires on Way candidate evaluation.

insert into commercial_groups (
  group_name, category, brands, vertical_scope, verify_case_by_case, parent_entity, notes
) values
  (
    'Experience Co',
    'experience_tourism',
    array[
      'Skydive Australia','Big Red Cat','Treetops Adventure',
      'Wild Bush Luxury','Reef Unlimited'
    ],
    array['way'],
    false,
    null,
    'ASX-listed. Auto-reject across all sub-brands.'
  ),
  (
    'Journey Beyond',
    'experience_tourism',
    array[
      'Ghan','Indian Pacific','Great Southern','Rottnest Express',
      'Cruise Whitsundays','Horizontal Falls Seaplane Adventures',
      'Sal Salis','Outback Spirit'
    ],
    array['way'],
    false,
    'Hornblower / Crestview Partners',
    'Auto-reject. Owned by Hornblower / Crestview Partners.'
  ),
  (
    'SeaLink Marine & Tourism',
    'experience_tourism',
    array[
      'SeaLink','Captain Cook Cruises','Bridgeclimb Sydney'
    ],
    array['way'],
    false,
    'Kelsian Group',
    'ASX-listed group (Kelsian). Auto-reject sub-brands.'
  ),
  (
    'AAT Kings / TTC Tour Brands',
    'experience_tourism',
    array[
      'AAT Kings','Inspiring Journeys','Down Under Tours'
    ],
    array['way'],
    false,
    'The Travel Corporation',
    'Owned by Travel Corporation. Auto-reject. Also operates trade as private bus tours.'
  ),
  (
    'APT Travel Group',
    'experience_tourism',
    array[
      'APT','Travelmarvel','Botanica World Discoveries'
    ],
    array['way'],
    false,
    null,
    'Multi-day touring. Auto-reject.'
  ),
  (
    'Intrepid Group',
    'experience_tourism',
    array[
      'Intrepid Travel','Peregrine','Adventure World'
    ],
    array['way'],
    false,
    null,
    'Auto-reject for Australia Atlas — Australia operations.'
  ),
  (
    'G Adventures',
    'experience_tourism',
    array['G Adventures'],
    array['way'],
    false,
    null,
    'Australia operations. Auto-reject.'
  ),
  (
    'Discovery Holiday Parks / G''day Group',
    'experience_tourism',
    array['Discovery Holiday Parks','G''day Group'],
    array['way'],
    false,
    null,
    'Tour and experience products specifically. Accommodation evaluated separately on Rest.'
  ),
  (
    'Voyages Indigenous Tourism Australia',
    'experience_tourism',
    array['Voyages Indigenous Tourism','Voyages'],
    array['way'],
    true,    -- verify_case_by_case = true
    'Indigenous Land and Sea Corporation',
    'Owned by ILSC but operates as a commercial group. Some sub-brands are genuinely community-rooted; others are commercial product with Aboriginal branding. Default is reject; exceptions need Aboriginal community endorsement.'
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
