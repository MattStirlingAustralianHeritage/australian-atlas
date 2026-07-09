-- 236_field_meta_add_fossicking.sql
-- Bring field_meta.feature_type CHECK in line with VERTICAL_CATEGORIES.field
-- (lib/sync/pushToVertical.js). Adds:
--   • fossicking — public fossicking & gemfield sites: designated fossicking
--     areas, gem parks and pay-to-dig grounds (Sapphire gemfields QLD, opal at
--     Lightning Ridge / Coober Pedy, goldfields, thundereggs, etc.). A visitable
--     natural / experiential destination.
--
-- field_meta CHECK was last widened to 12 values in
-- 091_add_botanic_garden_and_nature_reserve_types. Drop and recreate with the
-- full 13-value allowlist. Idempotent; widening cannot violate existing rows.

ALTER TABLE field_meta DROP CONSTRAINT IF EXISTS field_meta_feature_type_check;
ALTER TABLE field_meta ADD CONSTRAINT field_meta_feature_type_check
  CHECK (feature_type IN (
    'swimming_hole', 'waterfall', 'lookout', 'gorge',
    'coastal_walk', 'hot_spring', 'cave', 'national_park',
    'bush_walk', 'wildlife_zoo', 'botanic_garden', 'nature_reserve',
    'fossicking'
  ));

-- Search recall synonym bag (see 165_search_or_recall_category_synonyms.sql).
INSERT INTO listing_category_synonyms (vertical, sub_type, terms) VALUES
  ('field', 'fossicking', 'fossicking gem gemfield gemstone sapphire opal gold prospecting pay to dig gem park thunderegg zircon topaz rockhounding fossick digging designated fossicking area gem fields miners common')
ON CONFLICT (vertical, sub_type) DO UPDATE SET terms = excluded.terms;

NOTIFY pgrst, 'reload schema';
