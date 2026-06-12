-- 160: pre-outreach data fixes (2026-06-12)
--
-- 1) Byron Bay region narrative: delete the four sentences referencing
--    Stone & Wood, Wolf Lane Distillery, Huskee, "Newrybar Boutique Hotel"
--    and "Federal Village B&B" (generated_intro + long_description are
--    identical text). Sentence deletion only — no copy regenerated.
-- 2) Soft-archive listing aurum-premium-modern-honey-wines (scrape duplicate
--    of aurum-modern-honey-mead; same operator + website). status='hidden' —
--    reversible, excluded from every public surface by the active-only
--    allowlist. A reviewed listing_review_queue row records the action in the
--    gate-review UI.
-- 3) Pending editorial-review flag for the surviving aurum-modern-honey-mead.
-- 4) Strip utm_* / gclid / fbclid params from listings.website (246 rows at
--    probe time), preserving all other query params and #fragments.
--    updated_at deliberately NOT bumped (mass-bumping would reshuffle
--    recency-ordered browse surfaces).
--
-- Reversibility: full before/after row snapshots are written to
-- docs/audits/2026-06-12-pre-outreach/ by scripts/_pre_outreach_snapshot.mjs.
-- No DDL. No hard deletes. Admin/test fixture rows untouched.

BEGIN;

-- ── 1. Byron Bay narrative ──────────────────────────────────────────────────
UPDATE regions SET
  generated_intro = $byron$The Byron Bay region extends well beyond its famous lighthouse point, reaching inland across rolling green hills that rise from the coastal plain toward the Border Ranges. This is Australia's easternmost corner, where subtropical rainforest meets dairy country and the Pacific Ocean catches the continent's first light. The hinterland towns of Bangalow, Federal, Newrybar and Mullumbimby hold as much character as Byron itself, connected by winding roads that pass macadamia orchards, heritage pubs and weatherboard houses with wide verandas.

What distinguishes this corner of New South Wales is its density of locally owned enterprises, many established by tree-changers who arrived with city skills and country ambitions. The coffee culture runs deep here too, with roasters like Doma Coffee and The Byron Bean supplying the network of independent cafes that punctuate the Pacific Highway from Mullumbimby to Suffolk Park.

The region operates on two distinct seasonal rhythms. The hinterland stays green year-round thanks to consistent rainfall, but autumn and winter offer the clearest days for exploring. March through May provides the sweet spot: warm enough for swimming at Broken Head, cool enough for hiking the Cape Byron Walking Track without the summer heat, and crucially, after the school holiday exodus.

Time here moves differently than in conventional beach towns. Mornings might begin at Barefoot Barista in Mullumbimby before driving the back roads to Possum Creek Cottage or Myocum Ridge Farm Stay, where the day unfolds without scheduled activities. The region rewards slow exploration: following winding lanes that lead to places like Bangalow Farmhouse, stopping at roadside stalls, discovering that Aurum Modern Honey Mead operates from what looks like an ordinary suburban property. The Byron Bay Lighthouse & Heritage Precinct provides historical context, but the real story plays out in conversations with the people who chose to build something here rather than somewhere easier.

What sets this region apart from other Australian coastal areas is its critical mass of creative enterprises operating at a genuinely local scale. Unlike the Gold Coast to the north, where development follows a predictable resort template, or the Coffs Coast to the south, which relies heavily on highway tourism, Byron Bay's hinterland has cultivated an ecosystem of small-scale producers who sell primarily to each other and to visitors who seek them out. The Suffolk Park Beach House or Broken Head Glamping exist because their owners wanted to create something specific to this place, not because market research identified an opportunity.

The region's prosperity rests on this foundation of independent operators who understand their local context. The presence of operations like Little Dragon Ginger Beer and Cape Byron Spirits suggests a maturing local market that can support increasingly specialized producers. This isn't alternative culture as lifestyle branding—it's a working example of what regional Australia might look like when communities prioritize local ownership over external investment. The result is a corner of the country where thoughtful visitors can spend days without encountering a single chain operation, following instead a network of locally made connections that reveal how prosperity and place-making can align.$byron$,
  long_description = $byron$The Byron Bay region extends well beyond its famous lighthouse point, reaching inland across rolling green hills that rise from the coastal plain toward the Border Ranges. This is Australia's easternmost corner, where subtropical rainforest meets dairy country and the Pacific Ocean catches the continent's first light. The hinterland towns of Bangalow, Federal, Newrybar and Mullumbimby hold as much character as Byron itself, connected by winding roads that pass macadamia orchards, heritage pubs and weatherboard houses with wide verandas.

What distinguishes this corner of New South Wales is its density of locally owned enterprises, many established by tree-changers who arrived with city skills and country ambitions. The coffee culture runs deep here too, with roasters like Doma Coffee and The Byron Bean supplying the network of independent cafes that punctuate the Pacific Highway from Mullumbimby to Suffolk Park.

The region operates on two distinct seasonal rhythms. The hinterland stays green year-round thanks to consistent rainfall, but autumn and winter offer the clearest days for exploring. March through May provides the sweet spot: warm enough for swimming at Broken Head, cool enough for hiking the Cape Byron Walking Track without the summer heat, and crucially, after the school holiday exodus.

Time here moves differently than in conventional beach towns. Mornings might begin at Barefoot Barista in Mullumbimby before driving the back roads to Possum Creek Cottage or Myocum Ridge Farm Stay, where the day unfolds without scheduled activities. The region rewards slow exploration: following winding lanes that lead to places like Bangalow Farmhouse, stopping at roadside stalls, discovering that Aurum Modern Honey Mead operates from what looks like an ordinary suburban property. The Byron Bay Lighthouse & Heritage Precinct provides historical context, but the real story plays out in conversations with the people who chose to build something here rather than somewhere easier.

What sets this region apart from other Australian coastal areas is its critical mass of creative enterprises operating at a genuinely local scale. Unlike the Gold Coast to the north, where development follows a predictable resort template, or the Coffs Coast to the south, which relies heavily on highway tourism, Byron Bay's hinterland has cultivated an ecosystem of small-scale producers who sell primarily to each other and to visitors who seek them out. The Suffolk Park Beach House or Broken Head Glamping exist because their owners wanted to create something specific to this place, not because market research identified an opportunity.

The region's prosperity rests on this foundation of independent operators who understand their local context. The presence of operations like Little Dragon Ginger Beer and Cape Byron Spirits suggests a maturing local market that can support increasingly specialized producers. This isn't alternative culture as lifestyle branding—it's a working example of what regional Australia might look like when communities prioritize local ownership over external investment. The result is a corner of the country where thoughtful visitors can spend days without encountering a single chain operation, following instead a network of locally made connections that reveal how prosperity and place-making can align.$byron$
WHERE slug = 'byron-bay'
  AND generated_intro LIKE '%Stone & Wood%';

-- ── 2. Soft-archive the aurum duplicate ─────────────────────────────────────
UPDATE listings SET status = 'hidden', updated_at = now()
WHERE id = 'b828c293-f272-4ffc-8ac8-78ea5a190e33'
  AND slug = 'aurum-premium-modern-honey-wines'
  AND status = 'active';

INSERT INTO listing_review_queue
  (listing_id, flag_source, flag_reason, gate_flagged, confidence, suggested_action, status, reviewed_at, reviewed_by)
SELECT
  'b828c293-f272-4ffc-8ac8-78ea5a190e33', 'manual',
  'Pre-outreach audit 2026-06-12: duplicate of aurum-modern-honey-mead (same operator + website aurummead.com). Soft-archived: status set to hidden.',
  'character', 95, 'hide', 'hidden', now(), 'pre-outreach-audit'
WHERE NOT EXISTS (
  SELECT 1 FROM listing_review_queue
  WHERE listing_id = 'b828c293-f272-4ffc-8ac8-78ea5a190e33' AND reviewed_by = 'pre-outreach-audit'
);

-- ── 3. Editorial-review flag on the surviving aurum listing ─────────────────
INSERT INTO listing_review_queue
  (listing_id, flag_source, flag_reason, gate_flagged, confidence, suggested_action, status)
SELECT
  '1c65f6c2-65d8-462c-ad61-91e1342ff913', 'manual',
  'Pre-outreach audit 2026-06-12: editorial review — duplicate-pair survivor (AURUM PREMIUM variant archived). Verify name, description and website before outreach.',
  'character', 60, 'review', 'pending'
WHERE NOT EXISTS (
  SELECT 1 FROM listing_review_queue
  WHERE listing_id = '1c65f6c2-65d8-462c-ad61-91e1342ff913' AND status = 'pending'
);

-- ── 4. Strip tracking params from listings.website ──────────────────────────
WITH affected AS (
  SELECT id, website FROM listings
  WHERE website ~* '[?&](utm_[a-z0-9_-]*|gclid|fbclid)='
),
rebuilt AS (
  SELECT id, website AS before,
    split_part(split_part(website, '#', 1), '?', 1)
      || COALESCE('?' || NULLIF((
           SELECT string_agg(p, '&' ORDER BY ord)
           FROM unnest(string_to_array(split_part(split_part(website, '#', 1), '?', 2), '&'))
             WITH ORDINALITY AS t(p, ord)
           WHERE p <> '' AND p !~* '^(utm_[a-z0-9_-]*|gclid|fbclid)='
         ), ''), '')
      || COALESCE(substring(website FROM '#.*$'), '') AS after
  FROM affected
)
UPDATE listings l SET website = r.after
FROM rebuilt r
WHERE l.id = r.id AND r.after IS DISTINCT FROM l.website;

COMMIT;
