-- ============================================================
-- Migration 091: Add botanic_garden and nature_reserve to field_meta feature_type
-- ============================================================

ALTER TABLE field_meta
  DROP CONSTRAINT IF EXISTS field_meta_feature_type_check;

ALTER TABLE field_meta
  ADD CONSTRAINT field_meta_feature_type_check
  CHECK (feature_type IN (
    'swimming_hole', 'waterfall', 'lookout', 'gorge',
    'coastal_walk', 'hot_spring', 'cave', 'national_park',
    'bush_walk', 'wildlife_zoo',
    'botanic_garden', 'nature_reserve'
  ));
