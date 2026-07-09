-- 233_collection_meta_add_aboriginal_art_artist_studio.sql
-- Bring collection_meta.institution_type CHECK in line with
-- VERTICAL_CATEGORIES.collection (lib/sync/pushToVertical.js). Adds:
--   • aboriginal_art_centre — community-owned Aboriginal art centres and
--     keeping places (ANKA / Desart members: Papunya Tula, Warmun, Maruku,
--     Buku-Larrnggay Mulka, etc.). Visitable art spaces of national cultural
--     significance; distinct from a commercial 'gallery'.
--   • artist_studio — working artists' studios and artist-run spaces open to
--     the public (open-studio trails). Distinct from 'gallery' (exhibition-only)
--     and from Craft Atlas maker disciplines (medium-specific).
--
-- collection_meta CHECK was last widened to 11 values in
-- 193_collection_meta_add_theatre. Drop and recreate with the full 13-value
-- allowlist. Idempotent; widening a CHECK cannot violate existing rows.

ALTER TABLE collection_meta DROP CONSTRAINT IF EXISTS collection_meta_institution_type_check;
ALTER TABLE collection_meta ADD CONSTRAINT collection_meta_institution_type_check
  CHECK (institution_type IN (
    'museum', 'gallery', 'heritage_site', 'botanical_garden',
    'cultural_centre', 'sculpture_park', 'cinema', 'drive_in',
    'live_music_venue', 'comedy_club', 'theatre',
    'aboriginal_art_centre', 'artist_studio'
  ));

-- Search recall synonym bags (see 165_search_or_recall_category_synonyms.sql).
INSERT INTO listing_category_synonyms (vertical, sub_type, terms) VALUES
  ('collection', 'aboriginal_art_centre', 'aboriginal art centre indigenous art first nations art community art centre art centre keeping place ANKA Desart dot painting bark painting weaving ochre traditional owners cultural centre torres strait islander'),
  ('collection', 'artist_studio', 'artist studio open studio working studio artist run space art studio maker studio atelier studio trail visual artist painter sculptor printmaker studio visit')
ON CONFLICT (vertical, sub_type) DO UPDATE SET terms = excluded.terms;

NOTIFY pgrst, 'reload schema';
