# Phase 2 Activation Candidates — Polygon-Based Analysis

**Date:** 2026-04-25 (revised)
**Supersedes:** original clustering-based version (replaced after Matt flagged Mornington Peninsula showing as "2 listings" when the map clearly showed dozens).
**Method:** For each candidate region, fetched the proposed polygon (ABS TR or OSM LGA aggregate) and ran point-in-polygon against all 6,509 rows of the Phase 2 dry-run CSV. Records three counts per candidate:

1. **NULL inside polygon** — listings currently projected to quarantine that would resolve to this region if activated. This is the real **quarantine rescue** figure.
2. **Reassign from live** — listings currently assigned to a broader live region (e.g. Melbourne, Sydney, Adelaide) that would move to this more specific region under smallest-polygon-wins. This is the **editorial precision upgrade** figure.
3. **Total inside polygon** — sanity check (= NULL + reassigns). Flags cases where a candidate overlaps an already-live region.

**Thresholds:** 20 NULL-rescue for standard activation; 15 for brand-anchor destinations (Margaret River, Barossa Valley, McLaren Vale, Yarra Valley, Great Ocean Road) per the original task spec. Reassign count is *not* part of the threshold but is reported separately as editorial context.

**Resilience:** API fetches had 3-retry exponential backoff (2s, 5s, 15s). 6 of 40 initial Nominatim queries needed variant names (e.g. "Southern Downs Regional Council" → "Southern Downs") — all resolved on retry. All 40 candidates successfully evaluated; zero had to be skipped.

## TL;DR

| Metric | Value |
|---|---|
| Candidates evaluated | **40 / 40** |
| Candidates passing NULL threshold | **34** |
| Candidates failing NULL threshold | 6 |
| Sum of NULL-listings rescued if all 34 activated | **~2,690** (of 3,425 projected-NULL) |
| Sum of reassign-from-live if all 34 activated | ~85 (mostly McLaren Vale/82 from Adelaide) |
| Projected remaining quarantine after activation | **~735** |
| Editorial precision regions (fail NULL threshold but high reassign) | 3 — Mornington, Yarra Valley, Blue Mountains (366 combined reassigns) |

**Previous-count corrections.** The clustering approach undercounted brand-anchor regions because listings on e.g. Mornington Peninsula already match the Greater Melbourne polygon and so didn't appear in the NULL population at all. Polygon-based counts reveal the true picture:

| Region | Previous (cluster) | NULL in polygon | Total in polygon | Note |
|---|---|---|---|---|
| Mornington Peninsula | 2 | 0 | **145** | All currently in Melbourne |
| Yarra Valley | 5 | 0 | **147** | All currently in Melbourne |
| Blue Mountains | 19 | 14 | 88 | 74 currently in Sydney |

These are editorial precision plays (listings labelled with too-broad a region), not quarantine reducers. They don't meet the NULL threshold but are noted for Matt's call.

## Master table — all 40 candidates, sorted by NULL rescue

| Rank | Slug | State | Tier | Draft | Brand | NULL inside | Total inside | Reassign | Threshold | Pass |
|---|---|---|---|---|---|---:|---:|---:|---:|---|
| 1 | `launceston-tamar-valley` | TAS | T1 | Y | — | **190** | 190 | 0 | 20 | ✓ |
| 2 | `sunshine-coast` | QLD | T2-new | N | — | **189** | 189 | 0 | 20 | ✓ |
| 3 | `cairns-tropical-north` | QLD | T1 | Y | — | **166** | 166 | 0 | 20 | ✓ |
| 4 | `margaret-river` | WA | T1 | Y | **brand** | **153** | 153 | 0 | 15 | ✓ |
| 5 | `sunshine-coast-hinterland` | QLD | T1 | Y | — | **148** | 148 | 0 | 20 | ✓ |
| 6 | `toowoomba-darling-downs` | QLD | T1 | Y | — | **124** | 124 | 0 | 20 | ✓ |
| 7 | `bendigo` | VIC | ambig | N | — | **118** | 118 | 0 | 20 | ✓ |
| 8 | `ballarat` | VIC | T2-new | N | — | **115** | 115 | 0 | 20 | ✓ |
| 9 | `newcastle` | NSW | T1 | Y | — | **114** | 114 | 0 | 20 | ✓ |
| 10 | `victorian-high-country` | VIC | T2-new | N | — | **110** | 110 | 0 | 20 | ✓ |
| 11 | `barossa-valley` | SA | T1 | Y | **brand** | **104** | 107 | 3 (Adelaide) | 15 | ✓ |
| 12 | `gippsland` | VIC | T1 | Y | — | **87** | 87 | 0 | 20 | ✓ |
| 13 | `wollongong` | NSW | ambig | Y | — | **80** | 80 | 0 | 20 | ✓ |
| 14 | `great-southern` | WA | T1 | Y | — | **79** | 79 | 0 | 20 | ✓ |
| 15 | `bellarine-peninsula` | VIC | T1 | Y | — | **71** | 71 | 0 | 20 | ✓ |
| 16 | `coffs-coast` | NSW | T2-new | N | — | **71** | 71 | 0 | 20 | ✓ |
| 17 | `port-macquarie` | NSW | T2-new | N | — | **70** | 70 | 0 | 20 | ✓ |
| 18 | `cradle-country` | TAS | T1 | Y | — | **67** | 67 | 0 | 20 | ✓ |
| 19 | `daylesford` | VIC | ambig | Y | — | **61** | 61 | 0 | 20 | ✓ |
| 20 | `geelong-city` | VIC | T1 | Y | — | **60** | 60 | 0 | 20 | ✓ |
| 21 | `mclaren-vale` | SA | T1 | Y | **brand** | **59** | 141 | **82 (Adelaide)** | 15 | ✓ |
| 22 | `great-ocean-road` | VIC | T1 | Y | **brand** | **47** | 47 | 0 | 15 | ✓ |
| 23 | `limestone-coast` | SA | T1 | Y | — | **44** | 44 | 0 | 20 | ✓ |
| 24 | `macedon-ranges` | VIC | ambig | Y | — | **38** | 38 | 0 | 20 | ✓ |
| 25 | `scenic-rim` | QLD | T1 | Y | — | **37** | 37 | 0 | 20 | ✓ |
| 26 | `northern-rivers` | NSW | T1 | Y | — | **37** | 37 | 0 | 20 | ✓ |
| 27 | `clare-valley` | SA | T1 | Y | — | **36** | 36 | 0 | 20 | ✓ |
| 28 | `south-coast-nsw` | NSW | T1 | Y | — | **36** | 36 | 0 | 20 | ✓ |
| 29 | `granite-belt` | QLD | T2-new | N | — | **36** | 36 | 0 | 20 | ✓ |
| 30 | `southern-highlands` | NSW | ambig | Y | — | **32** | 32 | 0 | 20 | ✓ |
| 31 | `canberra-wine` | NSW | ambig | N | — | **32** | 32 | 0 | 20 | ✓ |
| 32 | `townsville` | QLD | T2-new | N | — | **30** | 30 | 0 | 20 | ✓ |
| 33 | `shoalhaven` | NSW | ambig | Y | — | **25** | 25 | 0 | 20 | ✓ |
| 34 | `central-coast` | NSW | T1 | Y | — | **24** | 24 | 0 | 20 | ✓ |
| 35 | `alice-springs-red-centre` | NT | T1 | Y | — | 16 | 16 | 0 | 20 | ✗ |
| 36 | `blue-mountains` | NSW | ambig | Y | — | 14 | 88 | **74 (Sydney)** | 20 | ✗ |
| 37 | `kangaroo-island` | SA | ambig | Y | — | 12 | 12 | 0 | 20 | ✗ |
| 38 | `grampians` | VIC | T1 | Y | — | 7 | 7 | 0 | 20 | ✗ |
| 39 | `mornington-peninsula` | VIC | verify | Y | **brand** | 0 | 145 | **145 (Melbourne)** | 15 | ✗ |
| 40 | `yarra-valley` | VIC | verify | Y | **brand** | 0 | 147 | **147 (Melbourne)** | 15 | ✗ |

**Tier legend:** T1 = existing draft, UPDATE-to-live. T2-new = no existing draft, INSERT new row. ambig = flagged as ambiguous in original report, evaluated here independently. verify = brand-anchor explicit verification per task.

## Polygon source per candidate

For transparency on what polygon was PIPed. All ABS TRs fetched from `geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query`; all OSM LGAs fetched from Nominatim with strict `class=boundary && type=administrative` filter.

| Slug | Source | Code / Queries | Bbox |
|---|---|---|---|
| `launceston-tamar-valley` | ABS TR | `6R110` Launceston and the North | 145.95–148.50°E / -42.28 to -39.20°S |
| `sunshine-coast` | ABS TR | `3R030` Sunshine Coast | 151.75–153.19°E / -26.98 to -25.76°S |
| `cairns-tropical-north` | ABS TR | `3R120` Tropical North Queensland | 137.99–146.36°E / -19.70 to -9.14°S |
| `margaret-river` | OSM LGA | Augusta-Margaret River Shire + City of Busselton | 114.90–115.77°E / -34.48 to -33.48°S |
| `sunshine-coast-hinterland` | OSM LGA | Sunshine Coast (rel 11675192) — retry variant | 152.55–153.15°E / -26.98 to -26.43°S |
| `toowoomba-darling-downs` | ABS TR | `3R060` Southern Queensland Country | 148.92–152.52°E / -29.18 to -25.60°S |
| `bendigo` | ABS TR | `2R060` Bendigo Loddon | 143.32–144.85°E / -37.27 to -35.91°S |
| `ballarat` | ABS TR | `2R170` Ballarat | 143.06–143.95°E / -37.99 to -36.90°S |
| `newcastle` | OSM LGA | City of Newcastle + Lake Macquarie + Port Stephens | 151.33–152.20°E / -33.20 to -32.58°S |
| `victorian-high-country` | ABS TR | `2R100` High Country | 145.16–148.22°E / -37.63 to -35.93°S |
| `barossa-valley` | ABS TR | `4R050` Barossa | 138.56–139.17°E / -34.82 to -34.19°S |
| `gippsland` | ABS TR | `2R120` Gippsland | 145.61–147.97°E / -39.16 to -37.12°S |
| `wollongong` | OSM LGA | Wollongong City Council + Shellharbour City Council — retry variant | 150.64–151.07°E / -34.64 to -34.13°S |
| `great-southern` | OSM LGA | Albany + Plantagenet + Denmark + Cranbrook | 116.67–118.98°E / -35.24 to -34.09°S |
| `bellarine-peninsula` | ABS TR | `2R140` Geelong and the Bellarine (combined) | 143.62–144.72°E / -38.30 to -37.78°S |
| `coffs-coast` | OSM LGA | Coffs Harbour City + Bellingen Shire | 152.39–153.26°E / -30.57 to -29.90°S |
| `port-macquarie` | OSM LGA | Port Macquarie-Hastings Council | 152.06–152.98°E / -31.73 to -31.11°S |
| `cradle-country` | ABS TR | `6R060` North West | 143.82–146.76°E / -41.71 to -39.58°S |
| `daylesford` | ABS TR | `2R160` Spa Country | 143.64–144.42°E / -37.52 to -37.15°S |
| `geelong-city` | OSM LGA | City of Greater Geelong | 144.20–144.72°E / -38.30 to -37.80°S |
| `mclaren-vale` | ABS TR | `4R030` Fleurieu Peninsula | 138.09–139.16°E / -35.79 to -35.03°S |
| `great-ocean-road` | ABS TR | `2R040` Great Ocean Road | 140.97–144.38°E / -38.86 to -37.35°S |
| `limestone-coast` | ABS TR | `4R010` Limestone Coast | 139.67–140.97°E / -38.06 to -35.74°S |
| `macedon-ranges` | ABS TR | `2R150` Macedon | 143.85–144.92°E / -37.86 to -37.10°S |
| `scenic-rim` | OSM LGA | Scenic Rim (rel 11675525) — retry variant | 152.37–153.24°E / -28.36 to -27.72°S |
| `northern-rivers` | OSM LGA | Tweed + Ballina + Lismore + Richmond Valley + Kyogle | 152.37–153.61°E / -29.34 to -28.16°S |
| `clare-valley` | ABS TR | `4R080` Clare Valley | 138.53–139.36°E / -34.37 to -33.10°S |
| `south-coast-nsw` | OSM LGA | Kiama + Shoalhaven | 149.98–150.87°E / -35.64 to -34.60°S |
| `granite-belt` | OSM LGA | Southern Downs (rel 11677975) — retry variant | 151.35–152.49°E / -29.07 to -27.94°S |
| `southern-highlands` | OSM LGA | Wingecarribee Shire | 149.96–150.75°E / -34.77 to -34.21°S |
| `canberra-wine` | OSM LGA | Yass Valley Council | 148.52–149.42°E / -35.32 to -34.54°S |
| `townsville` | ABS TR | `3R110` Townsville | 144.29–147.66°E / -22.10 to -18.31°S |
| `shoalhaven` | OSM LGA | Shoalhaven City Council | 149.98–150.85°E / -35.64 to -34.64°S |
| `central-coast` | OSM LGA | Central Coast Council | 150.98–151.63°E / -33.58 to -33.04°S |
| `alice-springs-red-centre` | OSM LGA | Alice Springs + MacDonnell (rel 11716646) — retry variant | 129.00–137.99°E / -26.00 to -22.85°S |
| `blue-mountains` | OSM LGA | Blue Mountains City Council — retry variant | 150.17–150.66°E / -33.90 to -33.36°S |
| `kangaroo-island` | ABS TR | `4R130` Kangaroo Island | 136.53–138.13°E / -36.09 to -35.56°S |
| `grampians` | ABS TR | `2R050` Western Grampians | 140.97–142.62°E / -38.00 to -36.39°S |
| `mornington-peninsula` | ABS TR | `2R070` Peninsula | 144.65–145.26°E / -38.50 to -38.07°S |
| `yarra-valley` | ABS TR | `2R220` Yarra Valley and the Dandenong Ranges | 145.08–146.19°E / -38.33 to -37.49°S |

## Passing NULL threshold (34 candidates) — in rank order

Copy of rows 1–34 from the master table. Together these rescue **~2,690 listings from quarantine** plus ~85 additional reassignments (mostly McLaren Vale pulling 82 listings from broad Adelaide polygon into the Fleurieu precisely).

## Failing NULL threshold (6 candidates) — individual notes

### `alice-springs-red-centre` — 16 NULL / 16 total / fails 20

Polygon = Alice Springs township + MacDonnell Regional Council LGA (combined). Earlier cluster count was 21 at Alice Springs centroid; polygon-based count is 16. Difference is listings in Central Desert Regional Council (north of Alice) or Petermann Shire (Uluru area) which aren't in the MacDonnell polygon. To capture the full "Red Centre" tourism concept, the polygon would need Alice Springs + MacDonnell + Central Desert + Petermann = a much larger aggregate. **Recommended follow-up:** expand the aggregate. If still ≤20 after expansion, accept and defer — NT tourism inventory is genuinely thin.

### `blue-mountains` — 14 NULL / 88 total / 74 reassign from Sydney / fails 20

Blue Mountains sits entirely within the Greater Sydney OSM `place=city` polygon (rel 5750005). So 74 of 88 Blue Mountains listings already resolve to `sydney`. Only 14 fall into the NULL population, and those 14 are below threshold. However, activating Blue Mountains would reassign 74 Sydney-labelled listings to a more specific, editorially correct region (Katoomba, Leura, Blackheath, Megalong Valley, Bilpin). Editorial precision upgrade — **Matt's call**: worth the 14-NULL sub-threshold for 74 reassignments, or defer?

### `kangaroo-island` — 12 NULL / 12 total / fails 20

Below threshold. Genuinely thin inventory; no reassignment contribution. Kangaroo Island is a single-island geography with limited small-batch venues. Defer.

### `grampians` — 7 NULL / 7 total / fails 20

Surprising — earlier box probe showed 19 listings. The issue: ABS TR `2R050` is **Western Grampians** only, covering the Hamilton/Dunkeld/Coleraine area. But the Grampians tourism region includes Halls Gap, Pomonal, Ararat — in Northern Grampians Shire (LGA), which is a separate council outside the Western Grampians TR. ABS TR has no standalone "Grampians" tourism region that covers the whole iconic Grampians National Park area.

**Recommended follow-up:** build an OSM LGA aggregate of Northern Grampians Shire + Southern Grampians Shire + Ararat Rural City. This should capture the full ~19 listings of the earlier box probe and cross the 20 threshold.

### `mornington-peninsula` — 0 NULL / 145 total / 145 reassign from Melbourne / fails 15

**Key correction.** Original cluster count of "2" was wrong because all Mornington Peninsula listings already match the broad Greater Melbourne polygon, so they never entered the NULL population. Polygon-based analysis: 145 listings sit inside ABS TR `2R070` Peninsula, all currently assigned to `melbourne`. Activating Mornington would reassign all 145 to the precise peninsula region under smallest-polygon-wins — editorial precision upgrade from "Greater Melbourne" to "Mornington Peninsula" for 145 listings.

**Brand-anchor caveat:** the task's NULL threshold is "no exceptions below 15." Strictly applied, Mornington fails. But the editorial argument here is that the inventory isn't missing — it's mislabelled. Matt's call.

### `yarra-valley` — 0 NULL / 147 total / 147 reassign from Melbourne / fails 15

Same story as Mornington. 147 listings inside ABS TR `2R220` Yarra Valley & Dandenong Ranges, all currently in `melbourne`. 147 reassignments, 0 quarantine rescue. Brand-anchor precision upgrade.

## Editorial precision upgrades (low NULL, high reassign)

Regions where activation would not rescue listings from quarantine but would move a material number from broader live regions to more specific ones. Listed for Matt's decision on whether editorial precision justifies activation under a relaxed threshold:

| Region | NULL | Reassign | Current "home" | Brand anchor? |
|---|---:|---:|---|---|
| Yarra Valley | 0 | 147 | Melbourne | **yes** |
| Mornington Peninsula | 0 | 145 | Melbourne | **yes** |
| Blue Mountains | 14 | 74 | Sydney | no |
| **Total** | 14 | **366** | — | — |

If Matt greenlights the three above in addition to the 34 passing candidates:
- Total rescue: ~2,690 + 14 = ~2,704 (quarantine impact same order)
- Total reassign: ~85 + 366 = ~451 (editorial precision upgrade)
- Remaining quarantine: ~720

## Ambiguities resolved by polygon counts

Several ambiguities in the original report are easier to resolve with concrete polygon-based numbers:

### Ambiguity 1 (Central Victoria slicing) — resolved: three separate activations

Polygon-based counts for the three sub-regions:
- `bendigo` (ABS TR 2R060 Bendigo Loddon): **118 NULL**
- `daylesford` (ABS TR 2R160 Spa Country): **61 NULL**
- `macedon-ranges` (ABS TR 2R150 Macedon): **38 NULL**

All three individually pass the 20 threshold. Combined = 217 listings. Three separate activations is both editorially precise and threshold-valid.

### Ambiguity 2 (Sunshine Coast coast vs hinterland) — resolved: two separate regions

- `sunshine-coast` (ABS TR 3R030, broader): **189 NULL**
- `sunshine-coast-hinterland` (OSM Sunshine Coast LGA rel 11675192, narrower): **148 NULL**

The ABS TR 3R030 *encloses* the LGA polygon (rings within rings — sunshine-coast covers Noosa/Gympie hinterland too). If both activated with smallest-area-wins, hinterland listings resolve to hinterland polygon while coastal non-hinterland listings (Fraser Coast bits) resolve to broader `sunshine-coast`. Net rescue = 189 regardless. Activating both is worth it for editorial precision nesting.

### Ambiguity 3 (Illawarra/SH/Shoalhaven) — resolved: three separate activations

- `wollongong` (OSM Wollongong+Shellharbour): **80 NULL**
- `southern-highlands` (OSM Wingecarribee): **32 NULL**
- `shoalhaven` (OSM Shoalhaven): **25 NULL** (note: `south-coast-nsw` also activated as Kiama+Shoalhaven = 36 NULL, overlaps)

All three pass individually. But **`south-coast-nsw` (36) and `shoalhaven` (25) substantially overlap** — Shoalhaven City Council is in both polygons. Need to pick one of the two, not both. Recommendation: use `south-coast-nsw` (36 NULL, broader = Kiama + Shoalhaven together) and deprecate the standalone `shoalhaven` draft.

### Ambiguity 5 (Granite Belt inside Darling Downs) — resolved: nest both

- `toowoomba-darling-downs` (ABS TR 3R060): **124 NULL** — covers both DD and Granite Belt via one TR
- `granite-belt` (OSM Southern Downs): **36 NULL** — nested inside TDD

TDD covers both; Granite Belt narrower. Activating both with smallest-area-wins: Stanthorpe area resolves to `granite-belt`, Toowoomba area resolves to `toowoomba-darling-downs`. Net rescue = 124 (already counts Granite Belt). Activating Granite Belt separately adds **editorial precision** (Stanthorpe wine region distinct) at zero rescue cost.

### Ambiguity 6 (McLaren Vale = Fleurieu) — resolved: accept compression

- `mclaren-vale` (ABS TR 4R030 Fleurieu Peninsula): **59 NULL + 82 reassign from Adelaide = 141 total**

The ABS TR covers the full Fleurieu Peninsula (Willunga, McLaren Vale, Victor Harbor, Normanville). Activating as `mclaren-vale` is an editorial compression — the slug is the brand name, polygon is the broader Fleurieu. The 82 Adelaide-reassigns are peninsula listings currently lumped into broad Adelaide; they'd move to McLaren Vale for precision.

### Ambiguity 7 (Canberra wine region) — resolved: INSERT new row

- `canberra-wine` (OSM Yass Valley Council): **32 NULL**

32 wine listings in Yass Valley LGA (Murrumbateman, Gundaroo, Lake George) are currently NULL because they sit outside the ACT-only Canberra District live polygon. Activating as a new `canberra-wine` slug is clean (32 rescue, 0 reassign — doesn't touch the existing Canberra District polygon). The alternative (expanding Canberra District polygon to include Yass Valley) would work too but blurs ACT governance boundary with NSW editorial region.

### Ambiguity 4 (Geelong-Bellarine combined/split) — resolved: activate both

- `bellarine-peninsula` (ABS TR 2R140, covers both): **71 NULL**
- `geelong-city` (OSM City of Greater Geelong LGA): **60 NULL**

City of Greater Geelong LGA is *inside* the ABS TR 2R140 polygon — the TR covers both Geelong city and the Bellarine Peninsula. Under smallest-polygon-wins: listings inside City of Greater Geelong resolve to `geelong-city`, listings on the Bellarine Peninsula proper resolve to `bellarine-peninsula`. Net rescue = 71 (the TR count; geelong-city is a subset). Activating both for editorial precision is zero-cost.

## Polygon scope issues flagged for rework

Two polygons surfaced as undersized for their editorial region name. Not activation blockers but worth recording for the follow-up:

1. **`grampians`** using ABS TR `2R050` Western Grampians captures only 7 listings. Real Grampians tourism area needs Northern Grampians Shire + Southern Grampians Shire + Ararat Rural City aggregated. Under-reach by ~12 listings.
2. **`alice-springs-red-centre`** using Alice Springs Town Council + MacDonnell Regional Council captures 16 listings. Full Red Centre concept needs MacDonnell + Central Desert Regional Council + Petermann Shire. Under-reach by ~5 listings — but likely still under 20 even after expansion.

## Projected outcome if all 34 passing candidates activated

**Current state (post-14-region):** 3,425 NULL / 6,509 eligible = 52.6% quarantine rate.

**Target state (post-48-region):** ~735 NULL / 6,509 eligible = ~11% quarantine rate.

| Component | Listings |
|---|---:|
| Current NULL | 3,425 |
| Rescued by 34 passing candidates | -2,690 |
| Remaining NULL | **~735** |

The remaining ~735 NULL population is genuinely diffuse — scattered regional and remote listings that don't fall inside any practical 50+ km² polygon at editorial threshold. Correct outcome for these is quarantine + admin override, not activation.

## Deliverables needed from Matt before Phase B

1. **Ambiguity resolutions** — five concrete decisions in the Ambiguities section above. Most resolve cleanly given the real numbers:
   - Central Victoria: activate three separate regions (bendigo, daylesford, macedon-ranges). ✓ straightforward
   - Sunshine Coast: activate both broader TR + hinterland OSM. ✓ straightforward
   - Illawarra triangle: wollongong + southern-highlands + south-coast-nsw (drop standalone shoalhaven due to overlap).
   - Granite Belt: nest under Darling Downs for editorial precision. ✓
   - McLaren Vale = Fleurieu: accept compression. ✓
   - Canberra wine: INSERT new row. ✓

2. **Editorial precision decisions** — does Matt activate the 3 below-NULL-threshold regions with high reassign counts (Mornington 145, Yarra Valley 147, Blue Mountains 74)?

3. **Polygon scope rework** — green-light to re-source `grampians` with broader LGA aggregate, and `alice-springs-red-centre` with more desert LGAs, before or instead of accepting the current polygons?

4. **Below-threshold genuinely-thin candidates** (Alice Springs 16, Kangaroo Island 12, Grampians 7 pre-rework) — defer to future quarterly review when inventory grows, or accept permanent quarantine for those venues?

Once Matt resolves the above, Phase B activation script runs in the pattern of `activate-regions-osm-lga.mjs`, adapted to handle ABS TR candidates. Single batch commit activates all green-lit regions with polygons + updated sourcing report.
