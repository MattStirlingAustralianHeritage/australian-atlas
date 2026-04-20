-- 089: Add classes/workshops fields to craft_meta for portal sync

ALTER TABLE craft_meta ADD COLUMN IF NOT EXISTS offers_classes BOOLEAN DEFAULT FALSE;
ALTER TABLE craft_meta ADD COLUMN IF NOT EXISTS classes JSONB;
