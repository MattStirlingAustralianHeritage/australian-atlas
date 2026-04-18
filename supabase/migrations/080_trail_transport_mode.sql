-- Trail transport mode: drive, transit, or neighbourhood walk
-- Supports "No Car" mode and neighbourhood trail subtype

ALTER TABLE trails ADD COLUMN IF NOT EXISTS transport_mode TEXT NOT NULL DEFAULT 'drive';
ALTER TABLE trails ADD COLUMN IF NOT EXISTS neighbourhood_label TEXT;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS getting_there_origin JSONB;

-- Constraint: transport_mode must be one of the three allowed values
ALTER TABLE trails DROP CONSTRAINT IF EXISTS trails_transport_mode_check;
ALTER TABLE trails ADD CONSTRAINT trails_transport_mode_check
  CHECK (transport_mode IN ('drive', 'transit', 'neighbourhood'));
