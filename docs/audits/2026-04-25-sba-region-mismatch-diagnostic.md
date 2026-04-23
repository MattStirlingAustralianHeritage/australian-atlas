# SBA region-mismatch diagnostic — 2026-04-25

**Scope:** active SBA (Small Batch Atlas) listings whose `region` text value is not present in `regions.name` (live or draft). Flagged as 1,586 rows by check 15 of the 2026-04-24 audit.

**Goal:** turn the single audit count into an editorial picture. Understand what's in that field, classify it, and surface which values represent real editorial decisions (e.g. "activate this region before Phase 2") versus harmless contamination (Phase 2 self-heals via lat/lng spatial containment).

**Mode:** read-only. No writes to `listings`, `regions`, or any other table.

## 1. Top-line numbers

| Metric | Value |
|---|---:|
| Active SBA listings | **2155** |
| Of which: region text not in regions.name | **1586** |
| Live regions with polygon (used for PIP) | **9** |

## 2. Category breakdown

| Category | Count | % of mismatched |
|---|---:|---:|
| **Street address (digits or street-suffix word)** | 14 | 0.9% |
| **Suburb-shaped string whose lat/lng falls in a live metro polygon** | 390 | 24.6% |
| **Place name outside all live region polygons (town / tourism sub-region)** | 1182 | 74.5% |
| **Other (malformed, unusual shape)** | 0 | 0.0% |

### Street address (digits or street-suffix word)

**Count: 14**

**Top 20 most common values:**

| Region text value | Count |
|---|---:|
| `Petrie Terrace` | 1 |
| `92 Holben Rd` | 1 |
| `141 Onkaparinga Valley Road, Woodside,` | 1 |
| `St Leonards` | 1 |
| `436 Shark Point Rd` | 1 |
| `67 Rivers Lane McLaren Vale` | 1 |
| `2 Euroka Ave` | 1 |
| `149 Reids Way Wooragee VIC 3747` | 1 |
| `19-25 Little Bourke St Melbourne` | 1 |
| `Dargal Road` | 1 |
| `LOT 3503 CAVES ROAD, WILYABRUP, WA` | 1 |
| `13 Aranda Street, Slacks Creek` | 1 |
| `2862 Lyell Hwy` | 1 |
| `: 115 Bridgelands Rd Rosa Glen WA` | 1 |

**Sample listings (5 randomly picked):**

- **Caxton Street Brewing Company** (caxton-street-brewing-company) — region text: `Petrie Terrace` → PIP ⇒ **Brisbane** (-27.465, 153.013)
- **Barristers Block Wines** (barristers-block-wines) — region text: `141 Onkaparinga Valley Road, Woodside,` → PIP ⇒ **Adelaide Hills** (-34.942, 138.876)
- **Parallax Organic Vineyard** (parallax-organic-vineyard) — region text: `436 Shark Point Rd` (-42.783, 147.502)
- **McKellar Ridge Wines** (mckellar-ridge-wines) — region text: `2 Euroka Ave` (-31.076, 152.818)
- **Venom Brewing Taproom** (venom-brewing-taproom) — region text: `19-25 Little Bourke St Melbourne` → PIP ⇒ **Melbourne** (-37.811, 144.972)

**Phase 2 outlook for this category:** of 14 rows, 14 have lat/lng (100%), and **5 (36%) fall inside a currently-live region polygon**. The rest would land with `region_computed_id = NULL` (quarantine unless an override is set).

**Phase 2 destination breakdown for this category:**

| Would resolve to | Count |
|---|---:|
| (no match — NULL region_computed_id) | 9 |
| Brisbane | 1 |
| Adelaide Hills | 1 |
| Sydney | 1 |
| Adelaide | 1 |
| Melbourne | 1 |

### Suburb-shaped string whose lat/lng falls in a live metro polygon

**Count: 390**

**Top 20 most common values:**

| Region text value | Count |
|---|---:|
| `Marrickville` | 10 |
| `Herne Hill` | 8 |
| `Fremantle` | 8 |
| `Healesville` | 8 |
| `Brisbane City` | 6 |
| `Henley Brook` | 6 |
| `Coldstream` | 6 |
| `Baskerville` | 6 |
| `Bickley` | 5 |
| `Swan Valley` | 5 |
| `Middle Swan` | 5 |
| `Brookvale` | 5 |
| `Hahndorf` | 5 |
| `McLaren Flat` | 5 |
| `Yarra Glen` | 4 |
| `Northbridge` | 4 |
| `Botany` | 4 |
| `Thebarton` | 4 |
| `Dromana` | 4 |
| `Brunswick` | 4 |

**Sample listings (5 randomly picked):**

- **Cedar Fox Distilling Co.** (cedar-fox-distilling-co) — region text: `Coburg North` → PIP ⇒ **Melbourne** (-37.732, 144.961)
- **Dukes Distillery** (dukes-distillery) — region text: `South Wharf` → PIP ⇒ **Melbourne** (-37.824, 144.950)
- **Blasta Collective** (blasta-collective) — region text: `Burswood` → PIP ⇒ **Perth** (-31.960, 115.901)
- **Lion Mill Vineyards** (lion-mill-vineyards) — region text: `Sawyers Valley` → PIP ⇒ **Perth** (-31.887, 116.227)
- **Main & Cherry Cellar Door** (main-and-cherry-cellar-door) — region text: `Chandlers Hill` → PIP ⇒ **Adelaide** (-35.093, 138.612)

**Phase 2 outlook for this category:** of 390 rows, 390 have lat/lng (100%), and **390 (100%) fall inside a currently-live region polygon**. The rest would land with `region_computed_id = NULL` (quarantine unless an override is set).

**Phase 2 destination breakdown for this category:**

| Would resolve to | Count |
|---|---:|
| Melbourne | 139 |
| Perth | 105 |
| Sydney | 64 |
| Adelaide | 52 |
| Brisbane | 30 |

### Place name outside all live region polygons (town / tourism sub-region)

**Count: 1182**

**Top 20 most common values:**

| Region text value | Count |
|---|---:|
| `Pokolbin` | 34 |
| `Orange` | 22 |
| `Rutherglen` | 19 |
| `Mudgee` | 17 |
| `Canberra` | 14 |
| `Hobart` | 13 |
| `Coonawarra` | 12 |
| `Beechworth` | 12 |
| `Bendigo` | 11 |
| `Heathcote` | 11 |
| `East Coast` | 10 |
| `Broke` | 10 |
| `Granite Belt` | 9 |
| `King Valley` | 9 |
| `Sunshine Coast` | 9 |
| `Burleigh Heads` | 7 |
| `Coal River Valley` | 7 |
| `Yallingup` | 7 |
| `Launceston` | 7 |
| `Tanunda` | 7 |

**Sample listings (5 randomly picked):**

- **Mount Nathan Winery** (mount-nathan-winery) — region text: `Mount Nathan` (-27.999, 153.260)
- **Angas Plains Wines** (angas-plains-wines) — region text: `Langhorne Creek` (-35.309, 138.979)
- **Common People Brewing Co** (common-people-brewing-co) — region text: `Bangalow` → PIP ⇒ **Byron Bay** (-28.698, 153.509)
- **Mount Pleasant Wines** (mount-pleasant-wines) — region text: `Pokolbin` (-32.818, 151.285)
- **Spreyton Fresh Cider** (spreyton-cider) — region text: `North West` (-41.243, 146.351)

**Phase 2 outlook for this category:** of 1182 rows, 1182 have lat/lng (100%), and **66 (6%) fall inside a currently-live region polygon**. The rest would land with `region_computed_id = NULL` (quarantine unless an override is set).

**Phase 2 destination breakdown for this category:**

| Would resolve to | Count |
|---|---:|
| (no match — NULL region_computed_id) | 1116 |
| Canberra District | 25 |
| Adelaide Hills | 20 |
| Hobart City | 17 |
| Byron Bay | 4 |

## 3. Cross-reference with lat/lng (sample of 20 per category)

For each category, 20 listings sampled deterministically. If Phase 2 backfill ran today, these would be their computed regions:

### Street address (digits or street-suffix word)

| # | Name | region text | → Phase 2 computed region | lat/lng |
|---:|---|---|---|---|
| 1 | Caxton Street Brewing Company | `Petrie Terrace` | **Brisbane** | -27.465, 153.013 |
| 2 | Victory Point Wines | `92 Holben Rd` | _(NULL → quarantine)_ | -33.882, 115.144 |
| 3 | Barristers Block Wines | `141 Onkaparinga Valley Road, Woodside,` | **Adelaide Hills** | -34.942, 138.876 |
| 4 | Finders Distillery | `St Leonards` | **Sydney** | -33.818, 151.191 |
| 5 | Parallax Organic Vineyard | `436 Shark Point Rd` | _(NULL → quarantine)_ | -42.783, 147.502 |
| 6 | J&J Wines | `67 Rivers Lane McLaren Vale` | **Adelaide** | -35.214, 138.527 |
| 7 | McKellar Ridge Wines | `2 Euroka Ave` | _(NULL → quarantine)_ | -31.076, 152.818 |
| 8 | Barking Owl Distilling Co. | `149 Reids Way Wooragee VIC 3747` | _(NULL → quarantine)_ | -36.299, 146.691 |
| 9 | Venom Brewing Taproom | `19-25 Little Bourke St Melbourne` | **Melbourne** | -37.811, 144.972 |
| 10 | Western Queensland Spirit | `Dargal Road` | _(NULL → quarantine)_ | -26.579, 148.713 |
| 11 | Stormflower Vineyard | `LOT 3503 CAVES ROAD, WILYABRUP, WA` | _(NULL → quarantine)_ | -33.747, 115.032 |
| 12 | Monkey Tree Brewing Co. | `13 Aranda Street, Slacks Creek` | _(NULL → quarantine)_ | -27.630, 153.128 |
| 13 | Two Metre Tall Farmhouse Ale & Cider | `2862 Lyell Hwy` | _(NULL → quarantine)_ | -42.731, 146.961 |
| 14 | Rosa Glen Farm | `: 115 Bridgelands Rd Rosa Glen WA` | _(NULL → quarantine)_ | -34.011, 115.183 |

### Suburb-shaped string whose lat/lng falls in a live metro polygon

| # | Name | region text | → Phase 2 computed region | lat/lng |
|---:|---|---|---|---|
| 1 | Cedar Fox Distilling Co. | `Coburg North` | **Melbourne** | -37.732, 144.961 |
| 2 | GinFinity | `Belgrave` | **Melbourne** | -37.901, 145.357 |
| 3 | Mr Little Beverage Co - Cider & Spirits | `Dromana` | **Melbourne** | -38.332, 144.987 |
| 4 | Yabby Lake Vineyard | `Tuerong` | **Melbourne** | -38.280, 145.083 |
| 5 | 2 Halfs Brewing & Distilling | `Alexandria` | **Sydney** | -33.903, 151.198 |
| 6 | Cozy Box Melbourne | `Carlton` | **Melbourne** | -37.800, 144.967 |
| 7 | Bailey Brewing Co. | `Henley Brook` | **Perth** | -31.813, 115.999 |
| 8 | Smart Brothers Brewing | `Hastings` | **Melbourne** | -38.315, 145.183 |
| 9 | The Great Northern Distillery | `Middle Swan` | **Perth** | -31.850, 116.016 |
| 10 | Devilbend Farm Beer Co | `Tuerong` | **Melbourne** | -38.285, 145.128 |
| 11 | Tallarida Vineyard and Winery - Cellar Door | `Boneo` | **Melbourne** | -38.397, 144.896 |
| 12 | Chief's Son Distillery | `Somerville` | **Melbourne** | -38.222, 145.183 |
| 13 | Sake Online Australia | `Mount Waverley` | **Melbourne** | -37.897, 145.127 |
| 14 | Wicked Kombucha | `O'Connor` | **Perth** | -32.063, 115.799 |
| 15 | Brisbane Brewing Co. Woolloongabba | `Woolloongabba` | **Brisbane** | -27.486, 153.029 |
| 16 | TarraWarra Yarra Valley Winery, Restaurant & Cellar Door | `Yarra Glen` | **Melbourne** | -37.660, 145.469 |
| 17 | Craiglee Vineyard | `Sunbury` | **Melbourne** | -37.586, 144.742 |
| 18 | Bakery Hill Distillery. | `Kensington` | **Melbourne** | -37.795, 144.933 |
| 19 | Drink West Brewery | `Penrith` | **Sydney** | -33.737, 150.695 |
| 20 | Kick Back Brewing | `Aldinga` | **Adelaide** | -35.268, 138.483 |

### Place name outside all live region polygons (town / tourism sub-region)

| # | Name | region text | → Phase 2 computed region | lat/lng |
|---:|---|---|---|---|
| 1 | Mount Nathan Winery | `Mount Nathan` | _(NULL → quarantine)_ | -27.999, 153.260 |
| 2 | Eight at the Gate Wines | `Coonawarra` | _(NULL → quarantine)_ | -37.302, 140.839 |
| 3 | Rebellion Brewery | `Wendouree` | _(NULL → quarantine)_ | -37.541, 143.811 |
| 4 | Apollo Bay Distillery | `Apollo Bay` | _(NULL → quarantine)_ | -38.759, 143.671 |
| 5 | Angas Plains Wines | `Langhorne Creek` | _(NULL → quarantine)_ | -35.309, 138.979 |
| 6 | Cypher Brewing Co | `Gungahlin` | **Canberra District** | -35.186, 149.138 |
| 7 | Lost Phoenix Spirits | `Hindmarsh Valley` | _(NULL → quarantine)_ | -35.490, 138.629 |
| 8 | Cargo Road Winery | `Orange` | _(NULL → quarantine)_ | -33.293, 148.975 |
| 9 | Common People Brewing Co | `Bangalow` | **Byron Bay** | -28.698, 153.509 |
| 10 | Montoro Wines | `Orange` | _(NULL → quarantine)_ | -33.269, 149.061 |
| 11 | Robbers Dog - Distillery | `Mount Pleasant` | _(NULL → quarantine)_ | -34.773, 139.050 |
| 12 | Hurdle Creek Still - Small Batch Gin Distillery | `Milawa` | _(NULL → quarantine)_ | -36.501, 146.417 |
| 13 | Mount Pleasant Wines | `Pokolbin` | _(NULL → quarantine)_ | -32.818, 151.285 |
| 14 | Canberra Cellar Door | `Parkes` | **Canberra District** | -35.290, 149.131 |
| 15 | SoHi Spirits | `Bowral` | _(NULL → quarantine)_ | -34.482, 150.417 |
| 16 | Eumundi Brewery | `Sunshine Coast` | _(NULL → quarantine)_ | -26.480, 152.950 |
| 17 | Spreyton Fresh Cider | `North West` | _(NULL → quarantine)_ | -41.243, 146.351 |
| 18 | Norton Road Wines | `Wamboin` | _(NULL → quarantine)_ | -35.251, 149.299 |
| 19 | Cargo Road Wines | `Orange` | _(NULL → quarantine)_ | -33.293, 148.975 |
| 20 | Flinders Gin | `Quorn` | _(NULL → quarantine)_ | -32.348, 138.038 |

## 4. Candidates for region activation before Phase 2

Region text values used by **more than 20 SBA listings** that are not present in the `regions` table and whose listings do NOT already fall inside a live polygon. These are the values where "activate a region" would substantially reduce the Phase 2 quarantine batch.

If a listed candidate has `any_already_in_live_polygon = yes`, at least one listing with that text is already covered by an existing live polygon via lat/lng; mixed state means partial resolution.

| Candidate region name | Listings using | With coords | Any already in live polygon | Approx centroid | Sample slugs |
|---|---:|---:|---|---|---|
| **Pokolbin** | 34 | 34 | no | -32.7707, 151.2971 | peterson-house-hunter-valley-winery; wild-ren-wines; vinden-wines; calais-estate-winery; moorebank-vineyard |
| **Orange** | 22 | 22 | no | -33.3001, 149.0665 | mayfield-vineyard; highland-heritage-cellar-door; printhie-wines; nashdale-lane-wines; orange-mountain-estate-wines |

## 5. Editorial recommendation

**Do nothing for:**

- **Category (a) — street addresses (14 rows).** Phase 2 reads from lat/lng, not the text field. 5 of these already fall inside a live polygon; the remainder fall where they fall. The legacy text is noise that Phase 3 will drop.
- **Category (b) — metro suburbs (390 rows).** Same reasoning — lat/lng in Greater Sydney/Melbourne/Brisbane/Perth/Adelaide resolves correctly regardless of the text value. These listings are already effectively correct; the text just says "Newtown" or "Fitzroy" where canonically it should say "Sydney" or "Melbourne", and Phase 2 writes the right answer.

**Decide for:**

- **Category (c) — regional / tourism / wine region names (1182 rows, 66 already resolved via polygon).** The 1116 listings that don't resolve via polygon will go to `region_computed_id = NULL` on Phase 2 and wait for an admin override. The candidate list in §4 above shows which specific region names would, if activated, cover chunks of this population. Each candidate is an editorial decision: does the Atlas want this region as part of its curated 55-region framework?
- **Category (e) — other (0 rows).** Usually malformed, non-standard, or unexpected. Small volume; can be hand-reviewed.

**Bottom line:** Of the 1586 mismatches, **470** (roughly) are harmless — Phase 2 self-heals via lat/lng. **1116** are the real editorial question: activate the candidate regions in §4, or let them quarantine and override per-listing.

## Appendix — methodology notes

- **Categorisation logic**: (a) regex match for digit or street-suffix word. (b) non-address place-candidate strings whose lat/lng hits a live metro polygon. (c) non-address place-candidate strings where lat/lng hits no live polygon. (e) everything else. There is no separate (d) wine-region class — wine regions are merged with (c) because a programmatic detector would be brittle and the top-values table within (c) surfaces them naturally.
- **Point-in-polygon**: client-side ray casting. For MultiPolygons, tests each polygon with standard outer/holes semantics. For overlap resolution (e.g. Adelaide vs Adelaide Hills), uses name-length as a weak proxy for specificity; a proper `ST_Area`-based tiebreak would need projection to an equal-area CRS, not worth it for this diagnostic given only 9 live polygons.
- **Live polygon set at run time**: Melbourne, Byron Bay, Brisbane, Hobart City, Canberra District, Sydney, Adelaide, Adelaide Hills, Perth. Two live regions (Darwin & Top End, Hobart & Southern Tasmania) still need manual polygons per the earlier sourcing report — their absence here means SBA listings in NT or southern Tasmania can't be PIP-resolved in this pass.
- **Why no suburb list was needed**: category (b) was inferred purely from "lat/lng falls inside a live capital-metro polygon". No external gazetteer required.
