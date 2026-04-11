-- ============================================================
-- Migration 055: Add bush_walk and wildlife_zoo to field_meta feature_type
-- ============================================================

-- Drop and recreate the CHECK constraint to include new values
ALTER TABLE field_meta
  DROP CONSTRAINT IF EXISTS field_meta_feature_type_check;

ALTER TABLE field_meta
  ADD CONSTRAINT field_meta_feature_type_check
  CHECK (feature_type IN (
    'swimming_hole', 'waterfall', 'lookout', 'gorge',
    'coastal_walk', 'hot_spring', 'cave', 'national_park',
    'bush_walk', 'wildlife_zoo'
  ));
