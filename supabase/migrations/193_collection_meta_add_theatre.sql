-- ============================================================
-- 193_collection_meta_add_theatre.sql
--
-- Adds 'theatre' to the collection_meta.institution_type CHECK
-- constraint for the Culture Atlas (collection) vertical.
--
-- Theatres, playhouses, and performing-arts venues — a new
-- primary institution type alongside live_music_venue / comedy_club.
--
-- This migration ALSO reconciles pre-existing drift: the live
-- constraint (last set by 076) only allowed 6 values
-- (museum, gallery, heritage_site, botanical_garden,
-- cultural_centre, sculpture_park), but the portal's canonical
-- vocabulary VERTICAL_CATEGORIES.collection (lib/sync/pushToVertical.js)
-- and the /admin/candidates classify dropdown already offer
-- cinema, drive_in, live_music_venue and comedy_club. Publishing
-- a candidate of any of those four would have failed this CHECK.
-- We therefore widen to the full declared vocabulary + theatre so
-- the constraint matches the code. Widening a CHECK is non-
-- destructive: every existing row remains valid; only the set of
-- accepted values grows.
--
-- Source: editorial decision 2026-06-29 (Theatre expansion of the
-- Culture Atlas vertical).
-- ============================================================

ALTER TABLE collection_meta DROP CONSTRAINT IF EXISTS collection_meta_institution_type_check;
ALTER TABLE collection_meta ADD CONSTRAINT collection_meta_institution_type_check
  CHECK (institution_type IN (
    'museum', 'gallery', 'heritage_site', 'botanical_garden',
    'cultural_centre', 'sculpture_park', 'cinema', 'drive_in',
    'live_music_venue', 'comedy_club', 'theatre'
  ));
