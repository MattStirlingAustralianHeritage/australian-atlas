-- 088: Add trail-specific columns to field_meta for bike trails and walking tracks

ALTER TABLE field_meta ADD COLUMN IF NOT EXISTS trail_distance_km DECIMAL;
ALTER TABLE field_meta ADD COLUMN IF NOT EXISTS trail_duration_minutes INTEGER;
ALTER TABLE field_meta ADD COLUMN IF NOT EXISTS trail_difficulty TEXT;
ALTER TABLE field_meta ADD COLUMN IF NOT EXISTS trail_surface TEXT;
ALTER TABLE field_meta ADD COLUMN IF NOT EXISTS trail_is_loop BOOLEAN;
ALTER TABLE field_meta ADD COLUMN IF NOT EXISTS trail_elevation_gain_m INTEGER;
ALTER TABLE field_meta ADD COLUMN IF NOT EXISTS trail_bike_type TEXT;
