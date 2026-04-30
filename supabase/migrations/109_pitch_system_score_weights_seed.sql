-- ============================================================
-- 109_pitch_system_score_weights_seed.sql
--
-- Seed pitch_score_weights with the Phase 1 candidate-scoring
-- weights from docs/pitch-system-design.md (Scoring section).
--
-- All seeds start with vertical = NULL (apply to all verticals)
-- and active = true. Per-vertical overrides can be added later
-- without code changes — scripts/pitch-candidates.mjs reads from
-- the table at runtime.
--
-- Signals dropped from Phase 1 (no source column on listings):
--   - operator_name populated (no operator_name column)
--   - distinguishing_practice (no column)
--   - opening_hours (no column)
--   - awards is added in 106 but not used as a Phase 1 scoring
--     signal — only as a "minimum data threshold" signal for the
--     general slot.
--
-- Slot-type semantics:
--   - 'general'      : applies only to general-slot scoring
--   - 'new_producer' : applies only to new-producer-slot scoring
--   - 'both'         : applies to either slot
-- ============================================================

insert into pitch_score_weights (signal_name, weight, slot_type, vertical, active) values
  -- Description length: full weight for general, reduced for new-producer
  ('description_length',       15, 'general',      null, true),
  ('description_length',       10, 'new_producer', null, true),

  -- Founding date populated (founded_year > 0)
  ('founding_date',             5, 'both',         null, true),

  -- Independence confirmed (TRUE only — NULL = no signal, do not score)
  ('independence_confirmed',   10, 'both',         null, true),

  -- Owner-operator confirmed (TRUE only — NULL = no signal, do not score)
  ('is_owner_operator',        10, 'both',         null, true),

  -- Single-location only (TRUE only — NULL = unknown, do not score)
  ('single_location',           5, 'both',         null, true),

  -- Regional location (not capital-city CBD)
  ('regional_location',         5, 'both',         null, true),

  -- Recently added to network (under 12 months) — general slot only.
  -- New-producer slot replaces this with a flat baseline below.
  ('recently_added',           10, 'general',      null, true),

  -- New-producer baseline: flat +20 for new-producer slot listings,
  -- replacing the "recently added" signal for that slot type.
  ('new_producer_baseline',    20, 'new_producer', null, true),

  -- No prior pitch attempts (listing not previously scored / pitched)
  ('no_prior_pitch_attempts',  10, 'both',         null, true),

  -- Geographic cluster (≥1 other Atlas listing within 25km radius)
  ('geographic_cluster',       10, 'both',         null, true),

  -- Heritage / distinctive practice documented (heritage_significance = TRUE)
  ('heritage_significance',    10, 'both',         null, true);
