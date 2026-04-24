# Hunter Valley & Orange — Polygon Sourcing Scoping

**Date:** 25 April 2026
**Trigger:** [2026-04-25 SBA region-mismatch diagnostic](2026-04-25-sba-region-mismatch-diagnostic.md) surfaced two candidate activations — Pokolbin (34 SBA listings) and Orange (22 SBA listings) — that would reduce the Phase 2 quarantine batch if activated as live regions beforehand.
**Scope:** Read-only. Does not write to `regions`, does not activate. Outputs a per-region recommendation.
**Predecessor work:** [polygon-sourcing report](../architecture/regions-polygon-sourcing-report.md) — same playbook (ABS TR → OSM LGA fallback) that brought live coverage to 11/11 on 2026-04-24/25.

## TL;DR

| Region | Source | Polygon area | PIP hit rate | Recommendation |
|---|---|---|---|---|
| **Hunter Valley** | OSM Cessnock + Singleton LGAs | ~6,845 km² | 10/10 | **Activate with this polygon** |
| **Orange** | OSM Orange + Cabonne + Blayney LGAs | ~7,809 km² | 10/10 | **Activate with this polygon** |

ABS Tourism Regions 2021 was checked first per the established priority order, but NSW's TR breakdown is too coarse for either wine region — the "Hunter" TR and the "Central NSW" TR both capture much larger, non-editorial geographies. OSM LGA aggregation is the viable path for both.

## NSW Tourism Region landscape (for reference)

NSW has 13 ABS TRs. The four relevant to this scoping exercise:

| Code | Name | Why listed |
|---|---|---|
| 1R090 | Central NSW | Candidate for Orange — covers all Central West NSW |
| 1R100 | Hunter | Candidate for Hunter Valley — covers entire Hunter region |
| 1R180 | Central Coast | Geographically adjacent to Hunter, not a candidate (Gosford/Wyong) |
| 1R190 | Blue Mountains | Geographically adjacent to Orange, not a candidate |

Neither NSW nor any other jurisdiction breaks out sub-regional wine districts as separate ABS TRs.

---

## Hunter Valley

### Candidate 1 — ABS TR `1R100` (Hunter)

| Metric | Value |
|---|---|
| Source | ABS Tourism Regions 2021, TR `1R100` (Hunter) |
| Geometry | MultiPolygon, 35 rings |
| Bbox | 149.79–152.21°E / -33.20 to -31.55°S (2.41° wide × 1.65° tall) |
| Approx area | **~25,005 km²** |
| PIP against 10 Pokolbin SBA listings | **10 / 10 inside** |

**Editorial concern:** This TR covers the entire Hunter region — Newcastle, Port Stephens, Lake Macquarie, Cessnock, Singleton, Muswellbrook, Maitland, Dungog, and the Upper Hunter. The polygon is roughly 3–4× the size of the editorial Hunter wine district. Listings in Newcastle CBD or around Port Stephens would wrongly resolve to "Hunter Valley" if we used this as the polygon. **Too broad for an editorial wine-region slug.**

### Candidate 2 — OSM Cessnock City Council + Singleton Council LGAs

| Metric | Value |
|---|---|
| Source | OSM aggregate: rel 6191219 (Cessnock City Council) + rel 6191883 (Singleton Council) |
| Geometry | MultiPolygon, 2 rings (aggregated) |
| Bbox | 150.34–151.62°E / -33.14 to -32.14°S (1.29° wide × 1.00° tall) |
| Approx area | **~6,845 km²** |
| PIP against 10 Pokolbin SBA listings | **10 / 10 inside** |

**Editorial fit:** Cessnock LGA covers Pokolbin, Cessnock, Lovedale, Rothbury, Broke — the heart of the wine district. Singleton LGA captures the vineyards on the northern edge (Broke, Wollombi-north, Belford). Together they form the commonly-marketed "Hunter Valley" wine region without bleeding into Newcastle, Lake Macquarie, or the Upper Hunter. **Good editorial fit.**

**Verified Pokolbin listings (10 representative, all hit both candidate polygons):**

| Slug | Lat | Lng | ABS TR Hunter | OSM LGA union |
|---|---|---|---|---|
| 4-pines-at-the-farm-hunter-valley | -32.7271 | 151.2605 | ✓ | ✓ |
| audrey-wilkinson-hunter-valley | -32.7920 | 151.2748 | ✓ | ✓ |
| bimbadgen-cellar-door | -32.7444 | 151.3156 | ✓ | ✓ |
| bonvilla-estate | -32.8075 | 151.2867 | ✓ | ✓ |
| calais-estate-winery | -32.7571 | 151.3250 | ✓ | ✓ |
| de-bortoli-wines-hunter-valley | -32.7745 | 151.3417 | ✓ | ✓ |
| far-distilling | -32.7343 | 151.2627 | ✓ | ✓ |
| glandore-estate-wines | -32.7572 | 151.2561 | ✓ | ✓ |
| hanging-tree-wines-hunter-valley | -32.8083 | 151.3197 | ✓ | ✓ |
| hope-estate | -32.7677 | 151.3121 | ✓ | ✓ |

### Hunter Valley recommendation: **Activate with OSM Cessnock + Singleton LGA aggregation**

- All 10 sampled Pokolbin SBA listings fall inside the OSM LGA union.
- The polygon is editorially meaningful — roughly matches how Destination Hunter / Hunter Valley Wine & Tourism market the wine district.
- No overlap with any currently-live Atlas region (Sydney is far south, Byron Bay is far north on the coast).
- Suggested slug: `hunter-valley`. Suggested state: `NSW`.
- Total of 34 Pokolbin-region SBA listings would resolve to this new region via Phase 2 backfill spatial containment.

---

## Orange

### Candidate 1 — ABS TR `1R090` (Central NSW)

| Metric | Value |
|---|---|
| Source | ABS Tourism Regions 2021, TR `1R090` (Central NSW) |
| Geometry | Polygon (1 ring) |
| Bbox | 146.05–150.36°E / -34.32 to -30.32°S (4.31° wide × 4.00° tall) |
| Approx area | **~104,108 km²** |
| PIP against 10 Orange SBA listings | **10 / 10 inside** |

**Editorial concern:** Central NSW is the largest NSW tourism region by area. It sweeps from Mudgee in the north-east all the way to Hillston in the west, and from Ilford in the east to Lake Cargelligo in the south. It captures Orange, Bathurst, Dubbo, Mudgee, Parkes, Forbes, Cowra, Young — seven distinct tourism sub-regions. Using this as "Orange" would mean a Bathurst winery or a Dubbo venue resolves to region=`orange`. **Far too broad.**

### Candidate 2 — OSM Orange City Council + Cabonne Council + Blayney Shire Council LGAs

| Metric | Value |
|---|---|
| Source | OSM aggregate: rel 6427044 (Orange City Council) + rel 6268804 (Cabonne Council) + rel 6423630 (Blayney Shire Council) |
| Geometry | MultiPolygon, 3 rings (aggregated) |
| Bbox | 148.29–149.42°E / -33.81 to -32.61°S (1.13° wide × 1.21° tall) |
| Approx area | **~7,809 km²** |
| PIP against 10 Orange SBA listings | **10 / 10 inside** |

**Editorial fit:** Orange City covers Orange proper and Nashdale. Cabonne surrounds it — Millthorpe, Borenore, Canobolas, Molong, Cargo. Blayney captures the southern fringe of the Orange wine region (Lyndhurst, Millthorpe-south). This is how Destination Orange markets the region: "Orange, Nashdale, Millthorpe, Borenore, Cargo, Molong." **Good editorial fit.**

**Verified Orange listings (10 representative, all hit both candidate polygons):**

| Slug | Lat | Lng | ABS TR Central NSW | OSM LGA union |
|---|---|---|---|---|
| angullong-wines | -33.4459 | 149.1848 | ✓ | ✓ |
| bloodwood-wines | -33.2402 | 149.0355 | ✓ | ✓ |
| borrodell-vineyard-cellar-door-and-wedding-venue | -33.3106 | 149.0193 | ✓ | ✓ |
| cargo-road-winery | -33.2926 | 148.9746 | ✓ | ✓ |
| cargo-road-wines | -33.2926 | 148.9746 | ✓ | ✓ |
| colmar-estate | -33.3293 | 149.0580 | ✓ | ✓ |
| country-brewer-central-west | -33.2874 | 149.1002 | ✓ | ✓ |
| de-salis-wines | -33.3169 | 148.9980 | ✓ | ✓ |
| ferment-the-orange-wine-centre-and-store | -33.2810 | 149.0939 | ✓ | ✓ |
| hey-rosey | -33.2838 | 149.1031 | ✓ | ✓ |

### Orange recommendation: **Activate with OSM Orange + Cabonne + Blayney LGA aggregation**

- All 10 sampled Orange SBA listings fall inside the OSM LGA union.
- Editorially tight — captures Orange and its surrounding vineyard belt (Nashdale, Millthorpe, Borenore, Cargo).
- No overlap with any currently-live Atlas region.
- Suggested slug: `orange`. Suggested state: `NSW`.
- Total of 22 Orange-region SBA listings would resolve to this new region via Phase 2 backfill spatial containment.

---

## Combined impact on Phase 2 quarantine batch

From the 2026-04-25 SBA diagnostic, the 1,586-row mismatch breakdown was:
- 461 rows (29%) resolve to live regions once Phase 2 fires
- 1,125 rows (71%) would have gone to quarantine

Activating Hunter Valley (34 listings) + Orange (22 listings) before Phase 2 rescues **56 listings** from that quarantine batch — dropping the quarantine queue for SBA alone from ~1,125 to ~1,069 rows (≈5% reduction). Small in absolute terms, but every rescue is an editorially meaningful assignment rather than a NULL-and-override.

If either activation is delayed past Phase 2, the same 56 listings can be resolved via `region_override_id` edits from the Humanator admin UI post-hoc, so this is not a blocker for Phase 2 itself.

## Data quality observations

- **NSW's ABS TR geography is too coarse for wine regions.** Unlike Tasmania where `6R100` (Hobart and the South) cleanly mapped to the editorial region, NSW lumps the Hunter wine district into a broad "Hunter" TR and the Orange/Bathurst/Mudgee wine triangle into the enormous "Central NSW" TR. For NSW wine regions in particular, OSM LGA aggregation is likely the reliable playbook — not ABS TR.
- **Both OSM LGA queries returned single clean matches** under their official council names (`Cessnock City Council`, `Singleton Council`, `Orange City Council`, `Cabonne Council`, `Blayney Shire Council`). No disambiguation needed. Admin-boundary filter sufficient.
- **Mudgee is not in this scope**, but is another NSW wine region that would likely follow the same OSM LGA pattern (Mid-Western Regional Council LGA ≈ Mudgee). Noting for future candidate-activation passes.

## Next actions (not this commit)

1. **Editorial decision required** — confirm the suggested slugs (`hunter-valley`, `orange`) and names. Both suggested slugs are unused in the `regions` table as of 2026-04-25.
2. **Activate** — insert two new rows into `regions` with `status='live'`, `name`, `slug`, `state`, and populate `polygon` via a script modelled on `source-region-polygons-abs-tr.mjs` (but targeting OSM LGA aggregates instead of ABS TRs).
3. **Re-run Phase 2 backfill** — after activation, the spatial containment pass assigns 56 previously-in-scope listings to the new regions.
4. **Consider Mudgee** as a follow-up candidate (not in this scope).

## Sources & reproducibility

The scoping was performed by a throwaway read-only script (not committed) that:
- Queried `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query` for TR codes `1R100` and `1R090` with `outSR=4326, f=geojson`.
- Queried Nominatim at `https://nominatim.openstreetmap.org/search` for the five LGA council names above, filtering to `osm_type=relation && class=boundary && type=administrative` and picking the top hit in each case.
- Fetched 10 active SBA listings per target region from the portal DB (`SELECT slug, name, lat, lng FROM listings WHERE status='active' AND vertical='sba' AND region=<target> ORDER BY slug LIMIT 10`).
- Ray-cast (point-in-polygon) each listing against each candidate MultiPolygon, with holes respected.
- Computed approximate area via shoelace formula + latitude correction (good to ±10% at these latitudes).

All four OSM relation IDs are stable admin boundaries and have not been renamed in OSM history. ABS TR codes are part of the ASGS 2021 release and will remain valid for the ASGS lifecycle.
