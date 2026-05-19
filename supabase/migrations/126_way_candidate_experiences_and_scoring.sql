-- Migration 126: way_candidate_experiences table + experience_id on signals
--
-- Phase 2C scoring layer prerequisites:
--
-- 1. way_candidate_experiences — per-experience records extracted by
--    Stage 1. Mirrors the Way project's experiences table (migration 002)
--    but scoped to the discovery pipeline's candidate model. Gate 4
--    (cultural authority) fires per-experience based on experience_type.
--
-- 2. experience_id nullable FK on way_candidate_signals — allows signals
--    to be tagged to a specific experience (e.g. TWC's Uluṟu walk gets
--    cultural_authority_claim signals tagged to the Uluṟu experience,
--    while Tasmanian walks get their own signals). Operator-level signals
--    (operator_name, established_year) have experience_id = NULL.

CREATE TABLE way_candidate_experiences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    uuid NOT NULL REFERENCES way_candidates(id) ON DELETE CASCADE,

  name            text NOT NULL,
  experience_type text NOT NULL CHECK (experience_type IN (
                    'guided_walk_multiday','guided_walk_day','cultural_tour',
                    'scenic_flight','helicopter_tour',
                    'sailing_charter','sea_kayak_tour','dive_operator',
                    'fishing_guide','photography_expedition',
                    'specialist_natural_history','foraging_bushfood',
                    'heritage_tour','workshop_intensive',
                    'river_canoe_tour','horseback_expedition',
                    'four_wheel_drive_expedition'
                  )),

  duration_band   text CHECK (duration_band IS NULL OR duration_band IN (
                    'half_day','full_day','overnight',
                    'multiday_2_3','multiday_4_7','expedition_8_plus'
                  )),

  gate_4_status   text CHECK (gate_4_status IS NULL OR gate_4_status IN (
                    'pass','fail','not_applicable'
                  )) DEFAULT 'not_applicable',
  gate_4_reason   text,

  -- Set to false when Gate 4 fails for this experience. The operator
  -- still surfaces; only this experience is excluded from listing detail.
  included_in_listing boolean NOT NULL DEFAULT true,

  run_id          uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX way_candidate_experiences_candidate_idx
  ON way_candidate_experiences(candidate_id);
CREATE INDEX way_candidate_experiences_type_idx
  ON way_candidate_experiences(experience_type);
CREATE INDEX way_candidate_experiences_run_idx
  ON way_candidate_experiences(run_id);

-- Tag signals to specific experiences. NULL = operator-level signal.
ALTER TABLE way_candidate_signals
  ADD COLUMN experience_id uuid REFERENCES way_candidate_experiences(id) ON DELETE SET NULL;
