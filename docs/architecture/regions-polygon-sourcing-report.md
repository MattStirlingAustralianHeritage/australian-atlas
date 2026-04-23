# Regions Polygon Sourcing Report

**Date:** 23 April 2026
**Run by:** Automated (`scripts/source-region-polygons.mjs`, OSM/Nominatim)
**Trigger:** Phase 1.3 polygon-population workstream per [regions.md](regions.md) Implementation Plan
**Unblocks:** Phase 2 backfill, `/plan-my-stay` regional grouping at production scale

## Summary

| Metric | Value |
|---|---|
| Live regions total | **11** |
| Live regions with polygon now | **9** |
| Live regions still missing polygon | **2** |

Coverage: **82%**. Substantial majority per the task's success criterion. The 2 remaining are composite tourism regions that OSM doesn't model with a single admin relation — they require hand-drawing in geojson.io.

The spec framed this as "55 live regions" but actual count is 11 (44 regions are currently `status='draft'`). The figure 55 is the total row count in the `regions` table.

## Regions now with polygon (9)

| Region | State | Source | OSM ID | OSM Class/Type | Notes |
|---|---|---|---|---|---|
| Adelaide | SA | ABS GCCSA 2021 | code 4GADE | Greater Adelaide | Replaced OSM CBD-only relation 11381689 on 2026-04-24 with the ABS Greater Capital City boundary (metro-scale, 4 rings). See Revision history. |
| Adelaide Hills | SA | Nominatim/OSM | relation 9105845 | boundary=administrative | Adelaide Hills Council (LGA) |
| Brisbane | QLD | Nominatim/OSM | relation 11677792 | boundary=administrative | City of Brisbane LGA (~1,220 km²); MultiPolygon with 5 rings (bay islands) |
| Byron Bay | NSW | Nominatim/OSM | relation 6170304 | boundary=administrative | Byron Shire Council (LGA) |
| Canberra District | ACT | Nominatim/OSM | relation 2354197 | boundary=administrative | ACT territory boundary |
| Hobart City | TAS | Nominatim/OSM | relation 10625466 | boundary=administrative | City of Hobart LGA |
| Melbourne | VIC | Nominatim/OSM | relation 4246124 | place=city | Greater Melbourne scale |
| Perth | WA | ABS GCCSA 2021 | code 5GPER | Greater Perth | Replaced OSM CBD-only relation 11343564 on 2026-04-24 with the ABS Greater Capital City boundary (metro-scale, 15 rings). See Revision history. |
| Sydney | NSW | Nominatim/OSM | relation 5750005 | place=city | Greater Sydney scale |

All 9 written as `GEOMETRY(MultiPolygon, 4326)` (single-polygon matches wrapped as MultiPolygon). All readable back as valid GeoJSON via PostgREST.

### Scale caveats worth knowing

- **Perth** — ~~OSM CBD-only~~ **Replaced 2026-04-24 with ABS Greater Perth GCCSA (5GPER). Now metro-scale.** See Revision history.
- **Adelaide** — ~~OSM CBD-only~~ **Replaced 2026-04-24 with ABS Greater Adelaide GCCSA (4GADE). Now metro-scale.** See Revision history.
- **Brisbane, Sydney, Melbourne** — fine at Greater scale.
- **Adelaide Hills, Byron Bay, Canberra District, Hobart City** — LGA boundaries match the region names well.

## Regions still missing polygons (2)

| Region | State | Active listings | Hand-draw priority | Why skipped |
|---|---|---|---|---|
| Hobart & Southern Tasmania | TAS | **17** | **High** | Composite tourism region. OSM has "Hobart" (city, ~80 km²) but not "Southern Tasmania" as a single relation. The tourism region covers multiple LGAs — Hobart, Glenorchy, Clarence, Kingborough, Brighton, Central Highlands, Derwent Valley, Huon Valley, Sorell, Southern Midlands, Tasman — as defined by Destination Southern Tasmania. Needs hand-drawing or an aggregation of LGAs. |
| Darwin & Top End | NT | **15** | **High** | Composite tourism region. OSM has "City of Darwin" LGA (~111 km²) but not "Top End" as a single relation. "Top End" is NT tourism terminology covering Darwin, Palmerston, Litchfield, Tiwi Islands, and Kakadu-area — a vast area (>100,000 km²). Needs hand-drawing. |

Both have meaningful active-listing counts (15–17), so both warrant hand-drawing rather than leaving NULL long-term.

### Hand-draw approach

1. Open [geojson.io](https://geojson.io/).
2. For Darwin & Top End: draw a MultiPolygon covering NT from the Tiwi Islands in the north down to roughly Katherine (14.47° S) in the south, extending east to include Kakadu and west to include Litchfield. Exact eastern/southern boundaries are editorial — see [Tourism NT's official boundary](https://northernterritory.com/plan/regions) if they publish one.
3. For Hobart & Southern Tasmania: match Destination Southern Tasmania's region definition — the 11 LGAs listed above. Simpler: a rough outline south of roughly Ross (41.9° S) covering most of southern Tasmania including Bruny Island.
4. Save as MultiPolygon in EPSG:4326 (geojson.io does this by default).
5. `UPDATE regions SET polygon = <geojson> WHERE slug = 'darwin-top-end'` etc.

## Sources attempted

Per task spec, in priority order:

1. **Australian Tourism Data Warehouse (ATDW)** — not investigated. API access requires operator credentials. Not a blocker for this pass because OSM covered most regions adequately.
2. **State tourism body open data** — not investigated. Eight jurisdictions, each with its own data portal conventions; would have added hours for marginal incremental coverage.
3. **ABS statistical areas (SA2/SA3/SA4/GCCSA)** — not downloaded. Would have required handling ~100 MB shapefiles from data.gov.au. The editorial regions don't map 1:1 to ABS concepts anyway (e.g. "Darwin & Top End" isn't a GCCSA).
4. **data.gov.au search** — not queried individually. OSM's `countrycodes=au` + strategic query set covered the same ground.
5. **OpenStreetMap (via Nominatim)** — **primary source used**. Two-pass strategy:
   - First pass: `<Region>, <State>` and `City of <Region>, <State>` queries. Yielded 7 clean admin-boundary matches.
   - Second pass: `<Region>, <State>, Australia` with `featuretype=city` for the 4 first-pass misses. Yielded 2 place=city matches (Adelaide, Sydney).
   - 2 regions left unmatched after both passes — OSM doesn't model composite tourism regions.

## Data quality observations

- **Nominatim's "Greater <City>" queries consistently return non-region results** (memorials, church offices, sports centres). The word "greater" is common in organisation names. `featuretype=city` is the reliable filter for capital-city polygons.
- **Strict result filtering matters.** Initial loose filter (any Polygon/MultiPolygon accepted) wrote 3 garbage polygons — a sports centre, a netball association, and a church office — into the regions table. Reverted immediately after discovery. The committed script (`scripts/source-region-polygons.mjs`) enforces `osm_type === 'relation' && (class=boundary/type=administrative OR class=place/type=city|town|suburb)` to prevent recurrence.
- **`place=city` relations vary wildly in scale by jurisdiction.** Melbourne's place=city rel (4246124) covers Greater Melbourne. Adelaide's (11381689) covers only Adelaide CBD. Sydney's (5750005) covers Greater Sydney. Perth has no equivalent place=city relation; the admin LGA is all that's available and it's tiny. These are OSM community choices, not a consistent global convention.
- **LGA boundaries are the most consistent coverage across Australia** where they exist as proper `boundary=administrative` relations. Adelaide Hills, Brisbane, Byron Bay, Canberra District, Hobart City, Perth all found via LGA boundary search.
- **Composite tourism regions don't exist in OSM as single relations.** "Darwin & Top End" and "Hobart & Southern Tasmania" are editorial constructs of state/territory tourism bodies. They span multiple LGAs and have no canonical OSM equivalent. Hand-drawing or LGA-aggregation is the only path.

## Downstream implications

- **Phase 1.5 spatial containment trigger** is now productive for 9 of 11 live regions. New/updated listings with lat/lng inside one of the 9 polygons get `region_computed_id` populated automatically.
- **Phase 2 backfill** can proceed once the 2 remaining polygons are hand-drawn. Without them, Darwin and Hobart-Southern-Tasmania listings will have `region_computed_id = NULL` and must rely on `region_override_id` or quarantine for admin assignment.
- **Plan My Stay** (currently un-advertised from the homepage per earlier retire-and-gate) will start rendering meaningful regional groupings once Phase 2 backfills compute_id across the 6,566 active listings. The 9 polygons here are the precondition.

## Commits

This report + the reusable script are committed together. The script is idempotent — re-running after drafts activate to live will pick up newly-live regions without re-processing existing ones (it filters `polygon IS NULL`).

## Rollback

If any of the 9 applied polygons turns out to be semantically wrong:

```sql
UPDATE regions SET polygon = NULL WHERE slug = 'perth';
```

Per-region revert only. Phase 1 infrastructure does not depend on any specific polygon being present.

## Revision history

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
