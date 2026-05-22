-- 131_extend_pitch_failure_mode_enum.sql
-- Extend pitch_failure_mode enum to include bail_token_detected,
-- used by lib/pitch/pipeline.mjs's detectBailToken safety net when
-- the model emits a bail string ('x', 'placeholder', etc) in headline,
-- angle, or editorial_framing.

ALTER TYPE pitch_failure_mode ADD VALUE IF NOT EXISTS 'bail_token_detected';
