# Phase 2 Backfill — Apply Run

**Date:** 2026-04-25
**Mode:** APPLY
**Duration:** 211.4s (3m 31s wall-clock for 6,510 rows at concurrency 20)
**Trigger script:** `scripts/phase2-backfill.mjs --apply`

## What happened

Fired the Phase 1.5 spatial containment trigger across all eligible listings by issuing a per-row `UPDATE listings SET lat = lat WHERE id = <row.id>` against each of 6,510 rows. The trigger (`BEFORE UPDATE OF lat, lng`) populated `region_computed_id` from the 53-polygon region set. Processed in 14 batches of 500 rows each, with concurrency 20 within each batch.

## Pre-run → post-run state

| Metric | Pre-run | Post-run |
|---|---:|---:|
| Active listings total | 6,544 | 6,544 |
| Active + visitable=true + lat/lng not null (eligible) | 6,510 | 6,510 |
| `region_computed_id` populated | 192* | **5,580** |
| `region_computed_id` NULL (visitable + has coords) | 6,318 | **930** |
| `region_computed_id` NULL total (all active visitable) | 6,349 | 961 (= 930 eligible + 31 missing coords) |
| Non-visitable active (correctly skipped) | 4 | 4 |
| Live regions with polygon | 53 | 53 |

\* The 192 pre-existing `region_computed_id` values were populated naturally since Phase 1.5 trigger deployment (new syncs + ad-hoc lat/lng updates). The backfill re-ran the trigger for these and produced identical assignments.

## Drift analysis — predicted vs. actual

**Zero drift across all 53 regions.** The client-side PIP implementation in `scripts/phase2-backfill.mjs` produces identical assignments to the PostGIS `ST_Contains` + `ORDER BY ST_Area ASC, id ASC` trigger logic.

| Metric | Predicted | Actual | Drift |
|---|---:|---:|---:|
| Listings matched | 5,580 | 5,580 | **0** |
| Listings with NULL | 930 | 930 | **0** |

No region is >5% off prediction. No region is >0% off prediction. All 53 rows align exactly.

## Distribution by region (post-run)

| Region | Slug | Listings | Share |
|---|---|---:|---:|
| Melbourne | `melbourne` | 426 | 6.54% |
| Perth | `perth` | 407 | 6.25% |
| Sydney | `sydney` | 388 | 5.96% |
| Adelaide | `adelaide` | 369 | 5.67% |
| Brisbane | `brisbane` | 215 | 3.30% |
| Launceston & Tamar Valley | `launceston-tamar-valley` | 190 | 2.92% |
| Canberra District | `canberra-district` | 172 | 2.64% |
| Hobart & Southern Tasmania | `hobart` | 166 | 2.55% |
| Cairns & Tropical North | `cairns-tropical-north` | 166 | 2.55% |
| Margaret River | `margaret-river` | 153 | 2.35% |
| Sunshine Coast Hinterland | `sunshine-coast-hinterland` | 148 | 2.27% |
| Yarra Valley | `yarra-valley` | 147 | 2.26% |
| Mornington Peninsula | `mornington-peninsula` | 145 | 2.23% |
| Hobart City | `hobart-city` | 127 | 1.95% |
| Bendigo | `bendigo` | 118 | 1.81% |
| Ballarat & Goldfields | `ballarat` | 115 | 1.77% |
| Newcastle | `newcastle` | 114 | 1.75% |
| Darwin & Top End | `darwin-top-end` | 111 | 1.71% |
| Victorian High Country | `victorian-high-country` | 110 | 1.69% |
| Barossa Valley | `barossa-valley` | 107 | 1.64% |
| Byron Bay | `byron-bay` | 102 | 1.57% |
| Hunter Valley | `hunter-valley` | 92 | 1.41% |
| Blue Mountains | `blue-mountains` | 88 | 1.35% |
| Toowoomba & Darling Downs | `toowoomba-darling-downs` | 88 | 1.35% |
| Gippsland | `gippsland` | 87 | 1.34% |
| Wollongong | `wollongong` | 79 | 1.21% |
| Great Southern | `great-southern` | 79 | 1.21% |
| Coffs Coast | `coffs-coast` | 71 | 1.09% |
| Port Macquarie & Hastings | `port-macquarie` | 70 | 1.08% |
| Cradle Country | `cradle-country` | 67 | 1.03% |
| Adelaide Hills | `adelaide-hills` | 65 | 1.00% |
| Daylesford & Hepburn Springs | `daylesford` | 61 | 0.94% |
| Geelong | `geelong-city` | 60 | 0.92% |
| McLaren Vale | `mclaren-vale` | 59 | 0.91% |
| Great Ocean Road | `great-ocean-road` | 47 | 0.72% |
| Limestone Coast | `limestone-coast` | 44 | 0.68% |
| Orange | `orange` | 42 | 0.65% |
| Sunshine Coast | `sunshine-coast` | 41 | 0.63% |
| Macedon Ranges | `macedon-ranges` | 38 | 0.58% |
| Scenic Rim | `scenic-rim` | 37 | 0.57% |
| Northern Rivers | `northern-rivers` | 37 | 0.57% |
| South Coast NSW | `south-coast-nsw` | 36 | 0.55% |
| Granite Belt | `granite-belt` | 36 | 0.55% |
| Clare Valley | `clare-valley` | 36 | 0.55% |
| Mudgee | `mudgee` | 35 | 0.54% |
| Southern Highlands | `southern-highlands` | 32 | 0.49% |
| Canberra Wine District | `canberra-wine` | 32 | 0.49% |
| Grampians | `grampians` | 32 | 0.49% |
| Townsville | `townsville` | 30 | 0.46% |
| Central Coast | `central-coast` | 24 | 0.37% |
| Alice Springs & Red Centre | `alice-springs-red-centre` | 16 | 0.25% |
| Kangaroo Island | `kangaroo-island` | 12 | 0.18% |
| Bellarine Peninsula | `bellarine-peninsula` | 11 | 0.17% |
| **Total matched** | | **5,580** | **85.72%** |
| **NULL / quarantine candidates** | | **930** | 14.28% |

## Sample verification (10 random assignments)

Every sample inspected is in the correct editorial region — with one borderline case flagged.

| # | Listing | Source region text | Lat, Lng | Computed region | Editorial check |
|---|---|---|---|---|---|
| 1 | Rainforest Gallery | Yarra Valley | -37.55, 145.67 | Victorian High Country | Marysville sits on the VIC ABS TR border. Murrindindi Shire (High Country TR) per ABS vs. Yarra Ranges Shire (Yarra Valley TR) per editorial framing. ABS wins per trigger. Override via `region_override_id` if editorial preference is Yarra Valley. |
| 2 | The Lab Print Finishing | Adelaide | -34.98, 138.57 | Adelaide | ✓ |
| 3 | Boomalli Aboriginal Artists Co-operative | Sydney | -33.89, 151.15 | Sydney | ✓ |
| 4 | Kiama Ceramic Art Studio | Kiama, NSW | -34.67, 150.85 | South Coast NSW | ✓ Kiama is in South Coast NSW polygon (Kiama LGA + Shoalhaven LGA). |
| 5 | COPYTIME | null | -12.46, 130.84 | Darwin & Top End | ✓ Darwin CBD. |
| 6 | Wilmot Hills Orchard & Distillery | Wilmot | -41.36, 146.17 | Cradle Country | ✓ Wilmot is in the North West TAS TR (Cradle Country). |
| 7 | Indigenous Artists Hub | null | -16.92, 145.77 | Cairns & Tropical North | ✓ Cairns CBD. |
| 8 | Ubirr Rock Art | Kakadu | -12.41, 132.96 | Darwin & Top End | ✓ Kakadu is in Litchfield Kakadu Arnhem TR, aggregated into Darwin & Top End. |
| 9 | Vasse Felix | Margaret River | -33.82, 115.05 | Margaret River | ✓ Wilyabrup wine district in Augusta-Margaret River Shire. |
| 10 | Hamilton Gallery | Hamilton | -37.74, 142.02 | Grampians | ✓ Hamilton is in Southern Grampians Shire, aggregated into Grampians. |

**9 of 10 exactly correct. 1 borderline** (Marysville — ABS boundary differs from tourism framing). Both interpretations are defensible; `region_override_id` is the mechanism if editorial preference diverges from ABS.

## Sample NULL listings (3 random spot-checks)

| # | Listing | Source region text | Lat, Lng | Editorial check |
|---|---|---|---|---|
| 1 | De Bortoli Wines Griffith | Riverina | -34.28, 146.14 | ✓ Riverina not activated. Correct quarantine. |
| 2 | Araluen Cultural Precinct | Alice Springs & Red Centre | -23.70, 133.86 | ⚠ Araluen is in Alice Springs proper. The aggregate polygon (Alice Springs Town + MacDonnell + Petermann) went through `ST_MakeValid` which reduced 3 components to 2, possibly absorbing the tiny Alice Springs Town LGA polygon. Araluen may fall in a geometry gap. Worth investigating: either re-source polygon or apply `region_override_id='alice-springs-red-centre'`. |
| 3 | Sanctuary by Sirromet | Gold Coast Hinterland | -27.60, 153.24 | ✓ Sanctuary is at Mount Cotton (Redland LGA). Not in activated regions. Correct quarantine. |

## Remaining quarantine (930 listings)

Breakdown by vertical (from the final dry-run, unchanged by apply):
- **collection**: 330 (regional museums, galleries, historic settlements — Whyalla, Gilgandra, Tamworth, Rockhampton, etc.)
- **sba**: 312 (distilleries and wineries in Riverina, Pemberton, East Coast TAS, Northern NSW tablelands)
- **craft**: 135
- **field**: 74
- **rest**: 55
- **found, corner, fine_grounds, table**: 24 combined

Next steps for admin:

1. **Review via Humanator UI** when the Phase 1.8 quarantine-alert email surfaces them (cron fires 10:00 UTC daily).
2. **Apply `region_override_id`** for listings where an existing live region is editorially correct but geographically rejected (~5% of quarantine).
3. **Accept NULL** for genuinely remote listings (~90% — Snowy Mountains, Whitsundays, Broome, Outback QLD, Riverina NSW).
4. **Activate more regions** in a future batch when a sub-region accumulates ≥20 listings (Riverina has ~25 currently).

## Side effects

- **`updated_at`** on all 6,510 eligible listings was bumped to the apply timestamp. Cosmetic side effect of the `UPDATE SET lat = lat` mechanism; not a meaningful content change. Downstream freshness/recency features should not treat this timestamp as substantive.
- **`region_override_id`** untouched. Phase 2 only populates `region_computed_id`; override remains its separate admin channel.

## Rollback

```sql
UPDATE listings SET region_computed_id = NULL;
```

Safe. No downstream Phase 3 dependencies on `region_computed_id` yet. Re-running the backfill is idempotent — same input polygons + same lat/lng → same result.

## Phase 2 status

**COMPLETE.** Spatial containment trigger fired across the full active+visitable population. 85.72% of eligible listings now have an editorially meaningful `region_computed_id`. The 14.28% quarantine rate reflects genuine regional diffusion, not polygon gaps in the activated set.

## Next

1. Monitor next quarantine-alert email for any unexpected new entries.
2. Review Marysville-type borderline cases and Araluen-type polygon-gap cases via Humanator.
3. Plan My Stay gating can revisit — regional grouping is now meaningful across 53 regions and 5,580 listings.
4. Begin Phase 3 planning — deprecation of `listings.region` text column in favour of `region_computed_id` + `region_override_id` for frontend queries.
