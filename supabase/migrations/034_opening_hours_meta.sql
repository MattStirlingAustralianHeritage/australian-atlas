-- Add opening_hours JSONB to _meta tables for retail and hospitality verticals
-- Enables completeness scoring and centralised hours data quality tracking
-- Format: { "monday": "9:00 AM - 5:00 PM", "tuesday": "Closed", ... }

ALTER TABLE corner_meta ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE found_meta ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE table_meta ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE fine_grounds_meta ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE sba_meta ADD COLUMN IF NOT EXISTS opening_hours JSONB;

COMMENT ON COLUMN corner_meta.opening_hours IS 'Synced from source DB. JSONB with day keys (monday-sunday). Values: time range string, "Closed", or null.';
COMMENT ON COLUMN found_meta.opening_hours IS 'Synced from source DB. JSONB with day keys (monday-sunday). Values: time range string, "Closed", or null.';
COMMENT ON COLUMN table_meta.opening_hours IS 'Synced from source DB. JSONB with day keys (monday-sunday). Values: time range string, "Closed", or null.';
COMMENT ON COLUMN fine_grounds_meta.opening_hours IS 'Synced from source DB. JSONB with day keys (monday-sunday). Values: time range string, "Closed", or null.';
COMMENT ON COLUMN sba_meta.opening_hours IS 'Synced from source DB. JSONB with day keys (monday-sunday). Values: time range string, "Closed", or null.';
