-- 132_phase3_schema.sql
-- Phase 3 of the pitch system: discovery pipeline data model.
-- Creates pitch_sources, pitch_characters, pitch_character_attributes,
-- and pitch_signals, plus their supporting enums.
--
-- This file documents the schema as applied via the Supabase SQL editor
-- on 2026-05-22. The four tables were previously dropped per the Phase 2
-- spec; they are deliberately re-introduced here as the foundation of
-- the discovery layer.
--
-- All statements are idempotent (IF NOT EXISTS guards) so this file can
-- be safely re-run against the live schema without erroring.
--
-- Spec: docs/pitch-system-phase3-design.md, "Data Model" section.

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE pitch_source_type AS ENUM (
    'venue_first_party',
    'editorial_third_party',
    'institutional',
    'atlas_internal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pitch_attribute_confidence AS ENUM (
    'explicit',
    'implied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pitch_signal_type AS ENUM (
    'press_coverage',
    'award',
    'listing_change',
    'cluster',
    'silence',
    'cross_reference',
    'recently_opened',
    'first_in_category',
    'founder_pivot',
    'emerging_recognition',
    'unusual_location',
    'methodology_novelty'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- pitch_sources
-- Every fact in a pitch traces back to a row here.
-- ============================================================

CREATE TABLE IF NOT EXISTS pitch_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  source_type pitch_source_type NOT NULL,
  source_url TEXT,
  source_publication TEXT,
  source_author TEXT,
  source_date DATE,
  source_text TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pitch_sources_listing_id ON pitch_sources(listing_id);
CREATE INDEX IF NOT EXISTS idx_pitch_sources_source_type ON pitch_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_pitch_sources_fetched_at ON pitch_sources(fetched_at);

-- ============================================================
-- pitch_characters
-- Named people. primary_source_id NOT NULL: no character can exist
-- without a real source row introducing them.
-- ============================================================

CREATE TABLE IF NOT EXISTS pitch_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  primary_source_id UUID NOT NULL REFERENCES pitch_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pitch_characters_listing_id ON pitch_characters(listing_id);
CREATE INDEX IF NOT EXISTS idx_pitch_characters_primary_source_id ON pitch_characters(primary_source_id);

-- ============================================================
-- pitch_character_attributes
-- One claim per row. Each attribute carries its own source_excerpt.
-- ============================================================

CREATE TABLE IF NOT EXISTS pitch_character_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES pitch_characters(id) ON DELETE CASCADE,
  attribute_type TEXT NOT NULL CHECK (attribute_type IN (
    'background', 'family_history', 'technique', 'achievement',
    'quote', 'biographical', 'philosophy'
  )),
  attribute_text TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES pitch_sources(id) ON DELETE RESTRICT,
  source_excerpt TEXT NOT NULL,
  confidence pitch_attribute_confidence NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pitch_character_attributes_character_id ON pitch_character_attributes(character_id);
CREATE INDEX IF NOT EXISTS idx_pitch_character_attributes_source_id ON pitch_character_attributes(source_id);

-- ============================================================
-- pitch_signals
-- Non-character signals. source_id nullable specifically for
-- 'silence' signals (which point at the absence of sources).
-- ============================================================

CREATE TABLE IF NOT EXISTS pitch_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  signal_type pitch_signal_type NOT NULL,
  source_id UUID REFERENCES pitch_sources(id) ON DELETE RESTRICT,
  signal_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pitch_signals_source_required CHECK (
    signal_type = 'silence' OR source_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_pitch_signals_listing_id ON pitch_signals(listing_id);
CREATE INDEX IF NOT EXISTS idx_pitch_signals_signal_type ON pitch_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_pitch_signals_source_id ON pitch_signals(source_id) WHERE source_id IS NOT NULL;
