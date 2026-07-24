-- ============================================================
-- 259_mount_lofty_estate_commercial_group.sql
--
-- Add the Mount Lofty Estate group to commercial_groups so the
-- independence gate (lib/gate-check/character.js, mirrored from
-- lib/prospector/way-discovery/gate-1-independence.js) rejects any
-- candidate or flags any live listing operating on the estate's
-- domains.
--
-- The estate operates five venues (Mount Lofty House, Sequoia Lodge,
-- The Gatekeeper's Day Spa, Hardy's Verandah restaurant, Mater
-- Hardy's / Martha Hardy's) under centralised management with Accor
-- MGallery affiliation. It fails the point-of-operation independence
-- test, so verify_case_by_case = false (hard fail, no editorial
-- exception).
--
-- Matching is DOMAIN-ONLY by design: name/brand matching is left empty
-- to avoid colliding with unrelated network entities that share tokens
-- ("Hardys" is already a wine brand under Accolade Wines; "Mount Lofty
-- Botanic Garden" is an independent public garden). The five domains
-- are specific and unambiguous.
--
-- vertical_scope = NULL (global): the estate spans accommodation, dining,
-- and day-spa, so the gate must apply across every vertical (see
-- lib/prospector/COMMERCIAL_GROUPS.md — NULL scope = global).
-- ============================================================

INSERT INTO commercial_groups
  (group_name, category, brands, brands_json, domains, vertical_scope,
   verify_case_by_case, parent_entity, source, notes)
VALUES (
  'Mount Lofty Estate',
  'hotel_accommodation',
  '{}',
  '[]'::jsonb,
  ARRAY[
    'mtloftyhouse.com.au',
    'sequoialodge.com.au',
    'gatekeepersdayspa.com.au',
    'hardysverandah.com.au',
    'marthahardys.com.au'
  ],
  NULL,
  false,
  'Accor (MGallery)',
  'mount-lofty-estate-group-removal 2026-07-24',
  'Estate operates five venues under centralised management with Accor MGallery affiliation; fails point-of-operation independence test.'
)
ON CONFLICT (group_name) DO NOTHING;
