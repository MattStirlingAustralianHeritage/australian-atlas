-- Run this in each vertical's Supabase SQL Editor to add verification columns.
-- Tables: venues (SBA, Collection, Craft), roasters (Fine Grounds),
--         properties (Rest), places (Field), shops (Corner, Found), listings (Table)
-- Corner Atlas and Table Atlas already have 'verified' — these are safe to re-run (IF NOT EXISTS).

-- Small Batch Atlas / Collection Atlas / Craft Atlas (venues table)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS verification_source text;

-- Fine Grounds Atlas (roasters table)
ALTER TABLE roasters ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE roasters ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE roasters ADD COLUMN IF NOT EXISTS verification_source text;

-- Rest Atlas (properties table)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS verification_source text;

-- Field Atlas (places table)
ALTER TABLE places ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verification_source text;

-- Corner Atlas (shops table — already has verified, adding missing columns)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verification_source text;

-- Found Atlas (shops table)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verification_source text;

-- Table Atlas (listings table — already has verified, adding missing columns)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verification_source text;
