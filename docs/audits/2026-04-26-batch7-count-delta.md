# Batch 7 — Region Count Delta (pre-flight)

**Date:** 2026-04-26
**Mode:** READ-ONLY (no DB writes)
**Trigger script:** `scripts/diff-region-counts.mjs`
**Outcome:** ⛔ **HALT — 46 of 53 live regions exceed the ±50% delta threshold. Code stopped before applying. Awaiting Matt's clearance.**

## Halt context for reviewer (read this first)

The threshold breaches are **not anomalies; they are the entire point of Phase 3**. The legacy ilike+alias logic matched on text-substring against the free-text `listings.region` column. Phase 3 replaces it with FK matching against `region_computed_id` / `region_override_id`, populated by the Phase 1.5 spatial-containment trigger and the Phase 2 backfill (5,580 listings, zero drift, per [2026-04-25-phase2-backfill-applied.md](2026-04-25-phase2-backfill-applied.md)).

The aggregate numbers line up exactly with that backfill:

- Live OLD total (legacy ilike+alias): **2,142**
- Live NEW total (FK match): **5,593** ≈ Phase 2 matched (5,580) + 13 region_override_id matches not driven by polygon trigger
- Most live regions roughly **double or triple** their count because vertical syncs use heterogeneous text values for `listings.region` (e.g. Hunter Valley listings tagged "Pokolbin", Launceston listings tagged "Tamar Valley Wine Region", every metro listing for any non-aliased inner suburb, every regional listing whose source DB used a different free-text label).

The two **net losers** are honest losses, not bugs:

- `bellarine-peninsula`: 26 → 11 (−15). Listings whose `region` text contained "Bellarine" but whose lat/lng falls outside the polygon (e.g. Geelong-edge listings now correctly counted under `geelong-city`).
- `orange`: 51 → 42 (−9). Sub-50% drop — ilike "Orange" was over-counting unrelated address fragments. (This one is below threshold and listed for completeness.)

**The single largest gainer (Perth: 119 → 407, +288)** is consistent with the metro-suburb alias map only handling 4 inner suburbs ("Leederville", "Northbridge", "Mount Lawley", "Subiaco") while the FK polygon now picks up every Greater Perth suburb (per the ABS Greater Capital City boundary applied in `9040072`).

**Recommendation:** the deltas are the expected migration shift. If Matt agrees, override the halt and proceed with apply. Otherwise, identify which regions need investigation before clearance.

## Method

For every region in the `regions` table, compare two count semantics:

- **OLD** — current production logic from `lib/sync/updateRegionCounts.js`:
  - Primary: `count(*) FROM listings WHERE status='active' AND region ILIKE '%<region.name>%'`
  - Plus aliases: same `ilike` against each entry in the alias map (skipping aliases whose value substring-includes the canonical name).
- **NEW** — FK-based per Decision 3:
  - `count(*) FROM listings WHERE status='active' AND (region_computed_id = $id OR region_override_id = $id)`

Halt threshold (live regions only): `|delta / old| > 50%`. For zero-base regions (`old = 0`), uses an absolute threshold of `new > 20` listings (matches the materiality cut from the 2026-04-25 SBA region-mismatch diagnostic — region activations >20 listings count as magnitude shifts).

## Summary

| Metric | Value |
|---|---:|
| Total regions scanned | 66 |
| Live regions | 53 |
| Draft regions | 13 |
| Live regions with breach (halt-worthy) | **46** |
| Live regions with any non-zero delta | 53 |
| Live regions with positive delta (gainers) | 51 |
| Live regions with negative delta (losers) | 2 |
| Live regions unchanged (delta = 0) | 0 |
| Live OLD total | 2142 |
| Live NEW total | 5593 |

## ⚠ Halt-threshold breaches (live regions)

| Region | Slug | OLD | NEW | Δ | Δ% | Note |
|---|---|---:|---:|---:|---:|---|
| Adelaide | `adelaide` | 210 | 369 | +159 | +75.7% | 75.7% change exceeds ±50% |
| Adelaide Hills | `adelaide-hills` | 34 | 65 | +31 | +91.2% | 91.2% change exceeds ±50% |
| Alice Springs & Red Centre | `alice-springs-red-centre` | 9 | 29 | +20 | +222.2% | 222.2% change exceeds ±50% |
| Ballarat & Goldfields | `ballarat` | 0 | 115 | +115 | n/a | gain from 0 → 115 exceeds 20-listing zero-base threshold |
| Barossa Valley | `barossa-valley` | 52 | 107 | +55 | +105.8% | 105.8% change exceeds ±50% |
| Bellarine Peninsula | `bellarine-peninsula` | 26 | 11 | -15 | -57.7% | -57.7% change exceeds ±50% |
| Bendigo | `bendigo` | 17 | 118 | +101 | +594.1% | 594.1% change exceeds ±50% |
| Blue Mountains | `blue-mountains` | 30 | 88 | +58 | +193.3% | 193.3% change exceeds ±50% |
| Byron Bay | `byron-bay` | 20 | 102 | +82 | +410.0% | 410.0% change exceeds ±50% |
| Cairns & Tropical North | `cairns-tropical-north` | 17 | 166 | +149 | +876.5% | 876.5% change exceeds ±50% |
| Canberra District | `canberra-district` | 40 | 172 | +132 | +330.0% | 330.0% change exceeds ±50% |
| Canberra Wine District | `canberra-wine` | 0 | 32 | +32 | n/a | gain from 0 → 32 exceeds 20-listing zero-base threshold |
| Clare Valley | `clare-valley` | 20 | 36 | +16 | +80.0% | 80.0% change exceeds ±50% |
| Coffs Coast | `coffs-coast` | 0 | 71 | +71 | n/a | gain from 0 → 71 exceeds 20-listing zero-base threshold |
| Cradle Country | `cradle-country` | 14 | 67 | +53 | +378.6% | 378.6% change exceeds ±50% |
| Darwin & Top End | `darwin-top-end` | 15 | 111 | +96 | +640.0% | 640.0% change exceeds ±50% |
| Daylesford & Hepburn Springs | `daylesford` | 18 | 61 | +43 | +238.9% | 238.9% change exceeds ±50% |
| Geelong | `geelong-city` | 21 | 60 | +39 | +185.7% | 185.7% change exceeds ±50% |
| Gippsland | `gippsland` | 29 | 87 | +58 | +200.0% | 200.0% change exceeds ±50% |
| Grampians | `grampians` | 21 | 32 | +11 | +52.4% | 52.4% change exceeds ±50% |
| Granite Belt | `granite-belt` | 9 | 36 | +27 | +300.0% | 300.0% change exceeds ±50% |
| Great Ocean Road | `great-ocean-road` | 13 | 47 | +34 | +261.5% | 261.5% change exceeds ±50% |
| Great Southern | `great-southern` | 21 | 79 | +58 | +276.2% | 276.2% change exceeds ±50% |
| Hobart & Southern Tasmania | `hobart` | 17 | 166 | +149 | +876.5% | 876.5% change exceeds ±50% |
| Hobart City | `hobart-city` | 76 | 127 | +51 | +67.1% | 67.1% change exceeds ±50% |
| Hunter Valley | `hunter-valley` | 48 | 92 | +44 | +91.7% | 91.7% change exceeds ±50% |
| Launceston & Tamar Valley | `launceston-tamar-valley` | 17 | 190 | +173 | +1017.6% | 1017.6% change exceeds ±50% |
| Limestone Coast | `limestone-coast` | 10 | 44 | +34 | +340.0% | 340.0% change exceeds ±50% |
| Macedon Ranges | `macedon-ranges` | 16 | 38 | +22 | +137.5% | 137.5% change exceeds ±50% |
| Margaret River | `margaret-river` | 80 | 153 | +73 | +91.3% | 91.3% change exceeds ±50% |
| Mornington Peninsula | `mornington-peninsula` | 32 | 145 | +113 | +353.1% | 353.1% change exceeds ±50% |
| Mudgee | `mudgee` | 18 | 35 | +17 | +94.4% | 94.4% change exceeds ±50% |
| Newcastle | `newcastle` | 62 | 114 | +52 | +83.9% | 83.9% change exceeds ±50% |
| Northern Rivers | `northern-rivers` | 11 | 37 | +26 | +236.4% | 236.4% change exceeds ±50% |
| Perth | `perth` | 119 | 407 | +288 | +242.0% | 242.0% change exceeds ±50% |
| Port Macquarie & Hastings | `port-macquarie` | 0 | 70 | +70 | n/a | gain from 0 → 70 exceeds 20-listing zero-base threshold |
| Scenic Rim | `scenic-rim` | 12 | 37 | +25 | +208.3% | 208.3% change exceeds ±50% |
| South Coast NSW | `south-coast-nsw` | 5 | 36 | +31 | +620.0% | 620.0% change exceeds ±50% |
| Sunshine Coast | `sunshine-coast` | 25 | 41 | +16 | +64.0% | 64.0% change exceeds ±50% |
| Sunshine Coast Hinterland | `sunshine-coast-hinterland` | 13 | 148 | +135 | +1038.5% | 1038.5% change exceeds ±50% |
| Sydney | `sydney` | 236 | 388 | +152 | +64.4% | 64.4% change exceeds ±50% |
| Toowoomba & Darling Downs | `toowoomba-darling-downs` | 14 | 88 | +74 | +528.6% | 528.6% change exceeds ±50% |
| Townsville | `townsville` | 17 | 30 | +13 | +76.5% | 76.5% change exceeds ±50% |
| Victorian High Country | `victorian-high-country` | 0 | 110 | +110 | n/a | gain from 0 → 110 exceeds 20-listing zero-base threshold |
| Wollongong | `wollongong` | 8 | 79 | +71 | +887.5% | 887.5% change exceeds ±50% |
| Yarra Valley | `yarra-valley` | 54 | 147 | +93 | +172.2% | 172.2% change exceeds ±50% |

## Biggest live-region movers (by |Δ|)

| Region | Slug | OLD | NEW | Δ | Δ% |
|---|---|---:|---:|---:|---:|
| Perth | `perth` | 119 | 407 | +288 | +242.0% |
| Launceston & Tamar Valley | `launceston-tamar-valley` | 17 | 190 | +173 | +1017.6% |
| Adelaide | `adelaide` | 210 | 369 | +159 | +75.7% |
| Sydney | `sydney` | 236 | 388 | +152 | +64.4% |
| Cairns & Tropical North | `cairns-tropical-north` | 17 | 166 | +149 | +876.5% |
| Hobart & Southern Tasmania | `hobart` | 17 | 166 | +149 | +876.5% |
| Sunshine Coast Hinterland | `sunshine-coast-hinterland` | 13 | 148 | +135 | +1038.5% |
| Canberra District | `canberra-district` | 40 | 172 | +132 | +330.0% |
| Melbourne | `melbourne` | 297 | 426 | +129 | +43.4% |
| Ballarat & Goldfields | `ballarat` | 0 | 115 | +115 | n/a |

## Per-region delta — live regions

| Region | Slug | OLD | NEW | Δ | Δ% | Notes |
|---|---|---:|---:|---:|---:|---|
| Adelaide | `adelaide` | 210 | 369 | +159 | +75.7% | 75.7% change exceeds ±50% |
| Adelaide Hills | `adelaide-hills` | 34 | 65 | +31 | +91.2% | 91.2% change exceeds ±50% |
| Alice Springs & Red Centre | `alice-springs-red-centre` | 9 | 29 | +20 | +222.2% | 222.2% change exceeds ±50% |
| Ballarat & Goldfields | `ballarat` | 0 | 115 | +115 | n/a | gain from 0 → 115 exceeds 20-listing zero-base threshold |
| Barossa Valley | `barossa-valley` | 52 | 107 | +55 | +105.8% | 105.8% change exceeds ±50% |
| Bellarine Peninsula | `bellarine-peninsula` | 26 | 11 | -15 | -57.7% | -57.7% change exceeds ±50% |
| Bendigo | `bendigo` | 17 | 118 | +101 | +594.1% | 594.1% change exceeds ±50% |
| Blue Mountains | `blue-mountains` | 30 | 88 | +58 | +193.3% | 193.3% change exceeds ±50% |
| Brisbane | `brisbane` | 168 | 215 | +47 | +28.0% |  |
| Byron Bay | `byron-bay` | 20 | 102 | +82 | +410.0% | 410.0% change exceeds ±50% |
| Cairns & Tropical North | `cairns-tropical-north` | 17 | 166 | +149 | +876.5% | 876.5% change exceeds ±50% |
| Canberra District | `canberra-district` | 40 | 172 | +132 | +330.0% | 330.0% change exceeds ±50% |
| Canberra Wine District | `canberra-wine` | 0 | 32 | +32 | n/a | gain from 0 → 32 exceeds 20-listing zero-base threshold |
| Central Coast | `central-coast` | 19 | 24 | +5 | +26.3% |  |
| Clare Valley | `clare-valley` | 20 | 36 | +16 | +80.0% | 80.0% change exceeds ±50% |
| Coffs Coast | `coffs-coast` | 0 | 71 | +71 | n/a | gain from 0 → 71 exceeds 20-listing zero-base threshold |
| Cradle Country | `cradle-country` | 14 | 67 | +53 | +378.6% | 378.6% change exceeds ±50% |
| Darwin & Top End | `darwin-top-end` | 15 | 111 | +96 | +640.0% | 640.0% change exceeds ±50% |
| Daylesford & Hepburn Springs | `daylesford` | 18 | 61 | +43 | +238.9% | 238.9% change exceeds ±50% |
| Geelong | `geelong-city` | 21 | 60 | +39 | +185.7% | 185.7% change exceeds ±50% |
| Gippsland | `gippsland` | 29 | 87 | +58 | +200.0% | 200.0% change exceeds ±50% |
| Grampians | `grampians` | 21 | 32 | +11 | +52.4% | 52.4% change exceeds ±50% |
| Granite Belt | `granite-belt` | 9 | 36 | +27 | +300.0% | 300.0% change exceeds ±50% |
| Great Ocean Road | `great-ocean-road` | 13 | 47 | +34 | +261.5% | 261.5% change exceeds ±50% |
| Great Southern | `great-southern` | 21 | 79 | +58 | +276.2% | 276.2% change exceeds ±50% |
| Hobart & Southern Tasmania | `hobart` | 17 | 166 | +149 | +876.5% | 876.5% change exceeds ±50% |
| Hobart City | `hobart-city` | 76 | 127 | +51 | +67.1% | 67.1% change exceeds ±50% |
| Hunter Valley | `hunter-valley` | 48 | 92 | +44 | +91.7% | 91.7% change exceeds ±50% |
| Kangaroo Island | `kangaroo-island` | 9 | 12 | +3 | +33.3% |  |
| Launceston & Tamar Valley | `launceston-tamar-valley` | 17 | 190 | +173 | +1017.6% | 1017.6% change exceeds ±50% |
| Limestone Coast | `limestone-coast` | 10 | 44 | +34 | +340.0% | 340.0% change exceeds ±50% |
| Macedon Ranges | `macedon-ranges` | 16 | 38 | +22 | +137.5% | 137.5% change exceeds ±50% |
| Margaret River | `margaret-river` | 80 | 153 | +73 | +91.3% | 91.3% change exceeds ±50% |
| McLaren Vale | `mclaren-vale` | 47 | 59 | +12 | +25.5% |  |
| Melbourne | `melbourne` | 297 | 426 | +129 | +43.4% |  |
| Mornington Peninsula | `mornington-peninsula` | 32 | 145 | +113 | +353.1% | 353.1% change exceeds ±50% |
| Mudgee | `mudgee` | 18 | 35 | +17 | +94.4% | 94.4% change exceeds ±50% |
| Newcastle | `newcastle` | 62 | 114 | +52 | +83.9% | 83.9% change exceeds ±50% |
| Northern Rivers | `northern-rivers` | 11 | 37 | +26 | +236.4% | 236.4% change exceeds ±50% |
| Orange | `orange` | 51 | 42 | -9 | -17.6% |  |
| Perth | `perth` | 119 | 407 | +288 | +242.0% | 242.0% change exceeds ±50% |
| Port Macquarie & Hastings | `port-macquarie` | 0 | 70 | +70 | n/a | gain from 0 → 70 exceeds 20-listing zero-base threshold |
| Scenic Rim | `scenic-rim` | 12 | 37 | +25 | +208.3% | 208.3% change exceeds ±50% |
| South Coast NSW | `south-coast-nsw` | 5 | 36 | +31 | +620.0% | 620.0% change exceeds ±50% |
| Southern Highlands | `southern-highlands` | 25 | 32 | +7 | +28.0% |  |
| Sunshine Coast | `sunshine-coast` | 25 | 41 | +16 | +64.0% | 64.0% change exceeds ±50% |
| Sunshine Coast Hinterland | `sunshine-coast-hinterland` | 13 | 148 | +135 | +1038.5% | 1038.5% change exceeds ±50% |
| Sydney | `sydney` | 236 | 388 | +152 | +64.4% | 64.4% change exceeds ±50% |
| Toowoomba & Darling Downs | `toowoomba-darling-downs` | 14 | 88 | +74 | +528.6% | 528.6% change exceeds ±50% |
| Townsville | `townsville` | 17 | 30 | +13 | +76.5% | 76.5% change exceeds ±50% |
| Victorian High Country | `victorian-high-country` | 0 | 110 | +110 | n/a | gain from 0 → 110 exceeds 20-listing zero-base threshold |
| Wollongong | `wollongong` | 8 | 79 | +71 | +887.5% | 887.5% change exceeds ±50% |
| Yarra Valley | `yarra-valley` | 54 | 147 | +93 | +172.2% | 172.2% change exceeds ±50% |

## Per-region delta — draft regions (informational)

Draft regions are not subject to the halt threshold. A draft going from non-zero (legacy ilike text matches) to zero (no polygon → no FK match) is expected; activation requires polygon work, not a count migration.

| Region | Slug | OLD | NEW | Δ |
|---|---|---:|---:|---:|
| Broome & Kimberley | `broome-kimberley` | 2 | 0 | -2 |
| Bruny Island | `bruny-island` | 5 | 0 | -5 |
| Central Victoria | `central-victoria` | 19 | 0 | -19 |
| Central West NSW | `central-west-nsw` | 0 | 0 | 0 |
| East Coast Tasmania | `east-coast-tasmania` | 7 | 0 | -7 |
| Flinders Ranges | `flinders-ranges` | 14 | 0 | -14 |
| Fremantle & Swan Valley | `fremantle-swan-valley` | 28 | 0 | -28 |
| Gold Coast Hinterland | `gold-coast-hinterland` | 20 | 0 | -20 |
| Murray River | `murray-river` | 7 | 0 | -7 |
| Noosa Hinterland | `noosa-hinterland` | 9 | 0 | -9 |
| Riverland | `riverland` | 7 | 0 | -7 |
| Shoalhaven | `shoalhaven` | 6 | 0 | -6 |
| Tamar Valley | `tamar-valley` | 32 | 0 | -32 |

## Interpretation

Deltas are not bugs. They reflect the architectural shift from text-substring matching to FK precision:

- **Positive delta (gainers)** — listings whose legacy `region` text did not contain the region name verbatim, but whose lat/lng falls inside the region polygon (so the Phase 1.5 trigger populated `region_computed_id`). The OLD ilike missed them; the NEW FK count picks them up.
- **Negative delta (losers)** — listings whose legacy `region` text contained an alias-mapped substring but whose lat/lng falls outside the polygon. Most commonly: SBA listings tagged with broader region names (e.g. "Hunter Valley") whose actual coordinates resolve to a different live region (or to quarantine).
- **Zero delta** — text and FK agree.

Both gain and loss are correct under the post-Decision-3 architecture. The FK-based count is the single authoritative source.
