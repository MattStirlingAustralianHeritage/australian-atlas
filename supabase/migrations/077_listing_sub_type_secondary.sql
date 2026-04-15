-- Add optional secondary subcategory to listings table
-- Used during candidate review to assign a second category (e.g. gallery + sculpture_park)
-- Not overwritten by vertical→master sync (sync only sets sub_type/sub_types from source)

ALTER TABLE listings ADD COLUMN IF NOT EXISTS sub_type_secondary TEXT;
COMMENT ON COLUMN listings.sub_type_secondary IS 'Optional secondary subcategory assigned during candidate review — not overwritten by vertical sync';
