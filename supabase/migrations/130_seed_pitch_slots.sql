-- 130_seed_pitch_slots.sql
-- Seed 30 pitch slots: 10 verticals × (1 general + 2 new_producer).
-- Spec: docs/pitch-system-design.md — each vertical gets one general slot
-- and two new-producer slots, supporting parallel uplift pitches per vertical.
--
-- This file documents the intended seed. As applied via the Supabase SQL
-- editor on 2026-05-22, the seed first inserted 20 rows (1+1 per vertical)
-- then was reseeded to 30 rows (1+2 per vertical) the same day.

INSERT INTO pitch_slots (vertical, slot_index, slot_type, status) VALUES
  ('portal', 1, 'general', 'active'),
  ('portal', 1, 'new_producer', 'active'),
  ('portal', 2, 'new_producer', 'active'),
  ('sba', 1, 'general', 'active'),
  ('sba', 1, 'new_producer', 'active'),
  ('sba', 2, 'new_producer', 'active'),
  ('table', 1, 'general', 'active'),
  ('table', 1, 'new_producer', 'active'),
  ('table', 2, 'new_producer', 'active'),
  ('craft', 1, 'general', 'active'),
  ('craft', 1, 'new_producer', 'active'),
  ('craft', 2, 'new_producer', 'active'),
  ('collection', 1, 'general', 'active'),
  ('collection', 1, 'new_producer', 'active'),
  ('collection', 2, 'new_producer', 'active'),
  ('rest', 1, 'general', 'active'),
  ('rest', 1, 'new_producer', 'active'),
  ('rest', 2, 'new_producer', 'active'),
  ('field', 1, 'general', 'active'),
  ('field', 1, 'new_producer', 'active'),
  ('field', 2, 'new_producer', 'active'),
  ('corner', 1, 'general', 'active'),
  ('corner', 1, 'new_producer', 'active'),
  ('corner', 2, 'new_producer', 'active'),
  ('found', 1, 'general', 'active'),
  ('found', 1, 'new_producer', 'active'),
  ('found', 2, 'new_producer', 'active'),
  ('fine_grounds', 1, 'general', 'active'),
  ('fine_grounds', 1, 'new_producer', 'active'),
  ('fine_grounds', 2, 'new_producer', 'active');
