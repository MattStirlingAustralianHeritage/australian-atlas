# Tarkine & West Coast region launch

**Date:** 5 May 2026
**Region UUID:** `c8aadaf0-98e6-4038-80e4-0263fdb40175`
**Slug:** `tarkine-west-coast`

## Summary

Launched a new live region covering Tasmania's far west — Stanley/Smithton on the north coast, the takayna/Tarkine, the heritage mining towns Strahan/Queenstown/Zeehan, and the southwest wilderness corridor (Port Davey, Bathurst Harbour, Melaleuca, South East Cape). Brings TAS region count to 8 and total live regions to 54.

## Polygon

Sourced via OSM aggregation:

- West Coast Council LGA (osm_id 10594916)
- Circular Head Council (osm_id 10593534)
- Southwest National Park (osm_id 6187193)
- ST_Difference against Cradle Mountain–Lake St Clair National Park (osm_id 3000260) to repair TWWHA over-coverage
- ST_UnaryUnion to repair self-intersection
- ST_SimplifyPreserveTopology @ tolerance 0.001 (~100m)

Final polygon: ST_IsValid true, 19,501.2 km², 7,675 vertices, 743 component polygons (islands preserved), 0.13 MB WKB.

Verification points (all 14 pass):

| Hard requirement | MUST be Tarkine | MUST NOT be Tarkine |
|---|---|---|
| | Strahan, Queenstown, Zeehan, Tullah, Corinna, Port Davey, Melaleuca | Cradle Mtn visitor centre, Lake St Clair, Sheffield, Hobart CBD, Bruny South, Wynyard |
| | (Ship Inn Stanley acceptable as Cradle Country by smallest-polygon rule) | |

## Listing reassignment

13 candidates identified (TAS listings whose lat/lng resolves to Tarkine via smallest-polygon rule):

- 10 high confidence (Queenstown/Strahan/Zeehan/Nelson Falls/Strahan rest listings)
- 1 medium confidence (Corinna Wilderness — 0.38 km from Cradle Country boundary; sanity-checked, find_containing_region returns Tarkine)
- 2 manual_review (Franklin Manor, Risby Cove — both have stale `region_override_id` to Cradle Country pre-launch; left untouched, to be cleared via Humanator post-launch)

11 high+medium reassigned via UPDATE. 2 manual_review skipped per spec (overrides are admin-only).

Plus a separate silent-backfill pass: 2 TAS listings (Bev's CROSS CRAFTS in Spreyton, Vibrance in Hobart) had valid coords inside live polygons but `region_computed_id` was NULL because the trigger never fired for them. Backfilled to Cradle Country and Hobart City respectively. Hard guard ensured exactly 2 rows.

Total 13 listings touched in Part 5. All changes logged to `backfill_log` with heuristics `tarkine_west_coast_region_launch_part5` and `silent_backfill_orphan_repair_part5_8`.

## Out of scope

- 5 TAS listings with interstate-mapped coordinates (Stone Flower Villa with positive lat, Roxburgh House and Tarraleah Estate at Brisbane coords, plus 2 others) — not touched.
- 36 East Coast Tasmania territory orphans — will resolve when that region activates.
- Stanley/Smithton/Marrawah listings remain in Cradle Country by smallest-polygon rule (Tarkine 19,501 km² > Cradle Country 12,941 km²). Editorial reassignment for specific Tarkine-character listings around Smithton (e.g. Tarkine Trails) goes through Humanator override.
- "Risby Cove" and "Risby Cove Boutique Hotel" are duplicate listings at the same address — merge is a separate task.

## Rollback

Pre-snapshot SQL dump captured at `/tmp/listings-pre-tarkine-snapshot-20260505-151221.sql`. To roll back: run the dump (13 UPDATE statements that restore prior `region_computed_id` / `region_override_id` / `region` values).

## Verification

- Production page at https://www.australianatlas.com.au/regions/tarkine-west-coast renders 200 with all 11 reassigned listings visible.
- Franklin Manor and Risby Cove correctly absent from the Tarkine page (their override resolves them to Cradle Country).
- TAS region distribution after launch: Cradle Country 69 (+1 silent), H&ST 169 (unchanged), Hobart City 129 (+1 silent), Launceston 187 (unchanged), Tarkine 11 (new), NULL 43 (down from 56).
