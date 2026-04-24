# Regions Polygon Sourcing Report

**Date:** 23 April 2026
**Run by:** Automated (`scripts/source-region-polygons.mjs`, OSM/Nominatim)
**Trigger:** Phase 1.3 polygon-population workstream per [regions.md](regions.md) Implementation Plan
**Unblocks:** Phase 2 backfill, `/plan-my-stay` regional grouping at production scale

## Summary

| Metric | Value |
|---|---|
| Live regions total | **11** |
| Live regions with polygon now | **11** |
| Live regions still missing polygon | **0** |

Coverage: **100%**. The two composite tourism regions (Darwin & Top End, Hobart & Southern Tasmania) were sourced from ABS Tourism Regions 2021 on 2026-04-25, replacing the earlier "hand-draw required" plan. See Revision history.

The spec framed this as "55 live regions" but actual count is 11 (44 regions are currently `status='draft'`). The figure 55 is the total row count in the `regions` table.

## Regions now with polygon (11)

| Region | State | Source | ID | Class/Type | Notes |
|---|---|---|---|---|---|
| Adelaide | SA | ABS GCCSA 2021 | code 4GADE | Greater Adelaide | Replaced OSM CBD-only relation 11381689 on 2026-04-24 with the ABS Greater Capital City boundary (metro-scale, 4 rings). See Revision history. |
| Adelaide Hills | SA | Nominatim/OSM | relation 9105845 | boundary=administrative | Adelaide Hills Council (LGA) |
| Brisbane | QLD | Nominatim/OSM | relation 11677792 | boundary=administrative | City of Brisbane LGA (~1,220 km²); MultiPolygon with 5 rings (bay islands) |
| Byron Bay | NSW | Nominatim/OSM | relation 6170304 | boundary=administrative | Byron Shire Council (LGA) |
| Canberra District | ACT | Nominatim/OSM | relation 2354197 | boundary=administrative | ACT territory boundary |
| Darwin & Top End | NT | ABS Tourism Regions 2021 | codes 7R010 + 7R100 | Tourism Region (aggregate) | Added 2026-04-25. Aggregate of Darwin + Litchfield Kakadu Arnhem. See Revision history. |
| Hobart & Southern Tasmania | TAS | ABS Tourism Regions 2021 | code 6R100 | Tourism Region | Added 2026-04-25. Hobart and the South. DB slug is `hobart` (not `hobart-southern-tasmania`). See Revision history. |
| Hobart City | TAS | Nominatim/OSM | relation 10625466 | boundary=administrative | City of Hobart LGA |
| Melbourne | VIC | Nominatim/OSM | relation 4246124 | place=city | Greater Melbourne scale |
| Perth | WA | ABS GCCSA 2021 | code 5GPER | Greater Perth | Replaced OSM CBD-only relation 11343564 on 2026-04-24 with the ABS Greater Capital City boundary (metro-scale, 15 rings). See Revision history. |
| Sydney | NSW | Nominatim/OSM | relation 5750005 | place=city | Greater Sydney scale |

All 11 written as `GEOMETRY(MultiPolygon, 4326)` (single-polygon matches wrapped as MultiPolygon; aggregate regions assembled by concatenating component polygon arrays — point-in-any-component equals point-in-region). All readable back as valid GeoJSON via PostgREST.

### Scale caveats worth knowing

- **Perth** — ~~OSM CBD-only~~ **Replaced 2026-04-24 with ABS Greater Perth GCCSA (5GPER). Now metro-scale.** See Revision history.
- **Adelaide** — ~~OSM CBD-only~~ **Replaced 2026-04-24 with ABS Greater Adelaide GCCSA (4GADE). Now metro-scale.** See Revision history.
- **Brisbane, Sydney, Melbourne** — fine at Greater scale.
- **Adelaide Hills, Byron Bay, Canberra District, Hobart City** — LGA boundaries match the region names well.

## Regions still missing polygons (0)

All 11 live regions now have a polygon. The two composite tourism regions (Darwin & Top End, Hobart & Southern Tasmania) that were previously flagged for hand-drawing were sourced from ABS Tourism Regions 2021 on 2026-04-25 — see Revision history.

## Sources attempted

Per task spec, in priority order:

1. **Australian Tourism Data Warehouse (ATDW)** — not investigated. API access requires operator credentials. Not a blocker.
2. **State tourism body open data** — not investigated. Eight jurisdictions, each with its own data portal conventions.
3. **ABS statistical areas** —
   - **GCCSA** used for Perth and Adelaide (2026-04-24 revision).
   - **Tourism Regions (TR)** used for the two composite regions Darwin & Top End and Hobart & Southern Tasmania (2026-04-25 revision). Accessed via ArcGIS REST at `geo.abs.gov.au` — no shapefile download needed.
4. **data.gov.au search** — not queried individually. OSM + ABS covered the same ground more directly.
5. **OpenStreetMap (via Nominatim)** — used for 7 of the 11 regions (Adelaide Hills, Brisbane, Byron Bay, Canberra District, Hobart City, Melbourne, Sydney). Two-pass strategy:
   - First pass: `<Region>, <State>` and `City of <Region>, <State>` queries. Yielded 7 clean admin-boundary matches.
   - Second pass: `<Region>, <State>, Australia` with `featuretype=city` for first-pass misses. Yielded 2 place=city matches.
   - Adelaide and Perth matches from this pass were later superseded by ABS GCCSA (2026-04-24 revision).
   - Composite tourism regions left unmatched after both passes were handled by ABS TR (2026-04-25 revision).

## Data quality observations

- **Nominatim's "Greater <City>" queries consistently return non-region results** (memorials, church offices, sports centres). The word "greater" is common in organisation names. `featuretype=city` is the reliable filter for capital-city polygons.
- **Strict result filtering matters.** Initial loose filter (any Polygon/MultiPolygon accepted) wrote 3 garbage polygons — a sports centre, a netball association, and a church office — into the regions table. Reverted immediately after discovery. The committed script (`scripts/source-region-polygons.mjs`) enforces `osm_type === 'relation' && (class=boundary/type=administrative OR class=place/type=city|town|suburb)` to prevent recurrence.
- **`place=city` relations vary wildly in scale by jurisdiction.** Melbourne's place=city rel (4246124) covers Greater Melbourne. Adelaide's (11381689) covers only Adelaide CBD. Sydney's (5750005) covers Greater Sydney. Perth has no equivalent place=city relation; the admin LGA is all that's available and it's tiny. These are OSM community choices, not a consistent global convention.
- **LGA boundaries are the most consistent coverage across Australia** where they exist as proper `boundary=administrative` relations. Adelaide Hills, Brisbane, Byron Bay, Canberra District, Hobart City, Perth all found via LGA boundary search.
- **Composite tourism regions don't exist in OSM as single relations**, but the ABS Tourism Regions geography does model them. "Hobart and the South" (ABS TR `6R100`) matched Hobart & Southern Tasmania as a single TR. "Top End" doesn't exist as a single ABS TR either — it was built by aggregating `7R010` (Darwin) + `7R100` (Litchfield Kakadu Arnhem). Tourism NT's "Top End" concept maps cleanly onto that two-TR union. ABS TR turned out to be the right authoritative source for composite tourism regions across Australia; hand-drawing was not needed.

## Downstream implications

- **Phase 1.5 spatial containment trigger** is now productive for all 11 live regions. New/updated listings with lat/lng inside any polygon get `region_computed_id` populated automatically.
- **Phase 2 backfill** is now fully unblocked — no region is left NULL-polygon-by-design.
- **Plan My Stay** (currently un-advertised from the homepage per earlier retire-and-gate) will start rendering meaningful regional groupings once Phase 2 backfills compute_id across the 6,566 active listings. The 11 polygons here are the precondition.

## Commits

This report + the reusable script are committed together. The script is idempotent — re-running after drafts activate to live will pick up newly-live regions without re-processing existing ones (it filters `polygon IS NULL`).

## Rollback

If any applied polygon turns out to be semantically wrong, revert that region only:

```sql
UPDATE regions SET polygon = NULL WHERE slug = 'perth';
```

Per-region revert only. Phase 1 infrastructure does not depend on any specific polygon being present. Re-sourcing scripts for two of the three polygon families are committed: [`source-region-polygons.mjs`](../../scripts/source-region-polygons.mjs) (OSM, covers 7 regions) and [`source-region-polygons-abs-tr.mjs`](../../scripts/source-region-polygons-abs-tr.mjs) (ABS TR, covers the 2 composite tourism regions). The GCCSA upgrade for Perth and Adelaide was done via ad-hoc queries against `geo.abs.gov.au` — to re-source, fetch `gccsa_code_2021 IN ('5GPER','4GADE')` from `ASGS2021/GCCSA/MapServer/0` with `outSR=4326`.

## Revision history

### 2026-04-25 — Darwin & Top End and Hobart & Southern Tasmania sourced from ABS Tourism Regions

The two composite tourism regions previously flagged for hand-drawing were sourced automatically from the ABS Tourism Regions 2021 (ASGS TR) geography, raising live-region polygon coverage from 9/11 to 11/11 (100%).

| Region | DB slug | Source | Component TR codes | Geometry |
|---|---|---|---|---|
| Hobart & Southern Tasmania | `hobart` | ABS TR 2021 | `6R100` (Hobart and the South) | MultiPolygon, 311 rings, bbox 145.83–148.06°E / -43.74 to -41.70°S, hash `690c559e7a9e2cc4` |
| Darwin & Top End | `darwin-top-end` | ABS TR 2021 | `7R010` (Darwin) + `7R100` (Litchfield Kakadu Arnhem) | MultiPolygon, 194 rings, bbox 130.02–136.99°E / -14.35 to -10.91°S, hash `7a15893aeeba790d` |

Source endpoint: `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query`. Same ABS ArcGIS convention as GCCSA: `outSR=4326` to coerce EPSG:4326, lowercase field names (`tr_code_2021`, `tr_name_2021`, `state_name_2021`). Script: [`scripts/source-region-polygons-abs-tr.mjs`](../../scripts/source-region-polygons-abs-tr.mjs).

**Hobart** — "Hobart and the South" is a single-TR match that cleanly maps to the Destination Southern Tasmania editorial region. Covers the 11 LGAs listed by DST (Hobart, Glenorchy, Clarence, Kingborough, Brighton, Central Highlands, Derwent Valley, Huon Valley, Sorell, Southern Midlands, Tasman) plus Bruny Island and offshore island groups. Note: the DB slug is `hobart`, not `hobart-southern-tasmania` as the long name suggests.

**Darwin & Top End** — no single "Top End" TR exists in ABS. Tourism NT's "Top End" (Darwin, Palmerston, Litchfield, Coomalie, Belyuen, Wagait, Tiwi Islands, Kakadu/West Arnhem) is the union of two adjacent TRs: `7R010` (Darwin) and `7R100` (Litchfield Kakadu Arnhem). These were assembled client-side by concatenating component polygon arrays into a single MultiPolygon — spatially equivalent to ST_Union for containment since a point in any component ring counts as a hit. Bounds stop just north of Katherine (-14.35°S max-south), which matches the editorial description from the earlier hand-draw plan. Katherine itself (in `7R110` Katherine Daly) is deliberately excluded — Tourism NT markets it separately.

Functional verification before apply: 30 sampled NT listings and 30 sampled TAS listings ray-cast against the proposed polygons. All Kakadu/Darwin City/Litchfield-region listings fell inside Top End; all Hobart-CBD/Bruny listings fell inside Hobart. Three TAS rows with "Hobart" in their region text were correctly *rejected* because the listing data itself was mis-labeled (Ross, Wynyard, Lemonthyme are not in Southern Tasmania).

**Overlap note:** Hobart & Southern Tasmania polygon geographically contains Hobart City (LGA). Per Edge Case 2 of the architecture spec (smallest polygon by area wins on overlap), listings inside the City of Hobart boundary resolve to Hobart City, with the broader Hobart & Southern Tasmania as their second-preference region — editorially correct.

**Rollback** if either polygon proves wrong:

```sql
UPDATE regions SET polygon = NULL WHERE slug IN ('darwin-top-end', 'hobart');
```

Both polygons are re-sourceable by running `node scripts/source-region-polygons-abs-tr.mjs --apply`.

### 2026-04-24 — Perth and Adelaide upgraded to ABS GCCSA

Replaced the CBD-only OSM polygons for Perth and Adelaide with ABS Greater Capital City Statistical Area 2021 boundaries. Prior polygons silently excluded the majority of metro-area listings (Fremantle, Joondalup, Rockingham for Perth; Mount Barker, Victor Harbor, Gawler for Adelaide).

| Region | Old source | New source | Geometry |
|---|---|---|---|
| Perth | OSM rel 11343564 (City of Perth LGA, ~20 km²) | ABS GCCSA 2021, code `5GPER` (Greater Perth) | MultiPolygon, 15 rings, bbox 115.45–116.42°E / -32.80 to -31.46°S |
| Adelaide | OSM rel 11381689 (place=city, CBD-scale) | ABS GCCSA 2021, code `4GADE` (Greater Adelaide) | MultiPolygon, 4 rings, bbox 138.44–139.04°E / -35.35 to -34.50°S |

Source endpoint: `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/GCCSA/MapServer/0`. ABS serves in Web Mercator (EPSG:102100) by default; `outSR=4326` coerces WGS84 on the server side, no client-side reprojection needed. Field names in the actual ABS schema are lowercased (`gccsa_code_2021`, `gccsa_name_2021`, `state_name_2021`) — aliases in metadata look like `GCCSA_CODE_2021` but the queryable field name is the lowercased form.

Functional verification: fired the spatial containment trigger against real listings ~60–70 km from each CBD. Mandurah Community Museum (-32.54, 115.72) now assigns to Perth; Weemilah Luxury Retreat (-35.29, 138.54) now assigns to Adelaide. Both would have returned NULL under the old polygons.

**Overlap note:** Greater Adelaide GCCSA geographically overlaps Adelaide Hills Council. Per Edge Case 2 of the architecture spec (smallest polygon by area wins on overlap), listings in the Adelaide Hills area resolve to Adelaide Hills, not Greater Adelaide — editorially correct.

**Rollback** if either new polygon proves wrong: the previous OSM relations are recoverable via the existing `scripts/source-region-polygons.mjs` (Nominatim queries `City of Perth, Western Australia` and `Adelaide, South Australia, Australia` with `featuretype=city`).
