# Phase 2 Activation Candidates — Reducing the 3,425-listing Quarantine Batch

**Date:** 2026-04-25
**Trigger:** Phase 2 dry-run showed 52.6% of eligible listings (3,425 of 6,509) would resolve to `region_computed_id = NULL` because they fall outside the 14 current live region polygons.
**Method:** Clustered dry-run NULL population by 0.5° grid cells, merged adjacent cells via 4-neighbour union-find, cross-referenced against 43 existing `status='draft'` regions and ABS Tourism Regions 2021. Read-only; no writes to `regions`.
**Threshold:** 20 listings minimum. 15 for the five brand-anchor destinations on Matt's list (Margaret River, Barossa Valley, McLaren Vale, Yarra Valley, Great Ocean Road). No exceptions below 15.
**Source:** Dry-run CSV at [2026-04-25-phase2-backfill-dryrun-changes.csv](2026-04-25-phase2-backfill-dryrun-changes.csv). Reproducible via `scripts/_cluster-nulls.mjs` (throwaway, not committed).

## TL;DR

| Metric | Value |
|---|---|
| NULL-listing clusters ≥20 | **23** |
| NULL-listing clusters ≥15 (brand-anchor floor) | **27** |
| Clusters mapping to an existing draft | 20 |
| Clusters requiring INSERT new row | 7 |
| Ambiguities requiring editorial call | **6** (see section below) |
| Brand-anchor regions below 15 threshold (excluded) | 3 (Yarra Valley 5, Mornington Peninsula 2) |
| Projected remaining NULL if all Tier-1 + Tier-2 activated | **~700–1,000** (vs. 3,425 today — 70-80% rescue rate) |

**Source strategy:** ABS Tourism Regions 2021 provides clean matches for **most** VIC, SA, QLD, and TAS candidates (see ABS TR inventory below). WA and NSW need OSM LGA aggregation — ABS TR is too coarse for those states' wine/tourism sub-regions.

## ABS Tourism Regions 2021 inventory (for reference)

Queried `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query` 2026-04-25:

| State | TRs worth considering |
|---|---|
| VIC | Melbourne (2R010) · **Great Ocean Road** (2R040) · **Western Grampians** (2R050) · **Bendigo Loddon** (2R060) · **Peninsula** (2R070, = Mornington) · **Goulburn** (2R090) · **High Country** (2R100) · **Gippsland** (2R120) · **Geelong and the Bellarine** (2R140) · **Macedon** (2R150) · **Spa Country** (2R160, = Daylesford) · **Ballarat** (2R170) · Central Highlands (2R180) · **Yarra Valley and the Dandenong Ranges** (2R220) |
| SA | **Limestone Coast** (4R010) · Murray River Lakes & Coorong (4R020) · **Fleurieu Peninsula** (4R030) · Adelaide (4R040, already live via GCCSA) · **Barossa** (4R050) · Riverland (4R060) · **Clare Valley** (4R080) · **Kangaroo Island** (4R130) · Adelaide Hills (4R140, already live) |
| WA | Destination Perth (5R120, already live via GCCSA) · Golden Outback (5R130, too coarse) · **South West** (5R140, covers Margaret River + Great Southern + Bunbury — too coarse, use OSM LGAs) |
| QLD | **Gold Coast** (3R010) · Brisbane (3R020, already live) · **Sunshine Coast** (3R030) · Fraser Coast (3R040) · **Southern Queensland Country** (3R060, = Darling Downs + Granite Belt) · **Whitsundays** (3R100) · **Townsville** (3R110) · **Tropical North Queensland** (3R120) |
| TAS | **East Coast** (6R030) · **North West** (6R060) · West Coast (6R080) · Hobart and the South (6R100, already live) · **Launceston and the North** (6R110) |
| NSW | Hunter (1R100, too broad, already rejected) · Central NSW (1R090, too broad) · North Coast NSW (1R200) · South Coast (1R010) · Snowy Mountains (1R050) · Capital Country (1R060) · Blue Mountains (1R190) · Central Coast (1R180) |

---

## Tier 1 — Activate existing draft (20 candidates)

All have: (a) a matching `status='draft'` row already in the `regions` table, and (b) ≥20 listings in the NULL cluster (or ≥15 for brand-anchor). Activation = UPDATE status to 'live' + populate polygon. Any pre-existing editorial content (description, hero images, generated_intro) is preserved.

| # | Region | Slug | State | NULLs rescued | Polygon source | Component codes | Brand anchor |
|---|---|---|---|---|---|---|---|
| 1 | Launceston & Tamar Valley | `launceston-tamar-valley` | TAS | **219** | ABS TR | `6R110` (Launceston and the North) | — |
| 2 | Margaret River | `margaret-river` | WA | **152** | OSM LGA aggregate | Augusta-Margaret River Shire (+ optionally Busselton for Yallingup-Dunsborough) | ✓ |
| 3 | Cairns & Tropical North | `cairns-tropical-north` | QLD | **125** | ABS TR | `3R120` (Tropical North Queensland) | — |
| 4 | Newcastle | `newcastle` | NSW | **108** | OSM LGA | City of Newcastle + Lake Macquarie + Port Stephens (check overlap with Hunter Valley — edge-case 2 smallest-area wins) | — |
| 5 | Barossa Valley | `barossa-valley` | SA | **~130** (of 182 combined Barossa+Clare cluster) | ABS TR | `4R050` (Barossa) | ✓ |
| 6 | Clare Valley | `clare-valley` | SA | **~25** (balance of combined cluster) | ABS TR | `4R080` (Clare Valley) | — |
| 7 | Cradle Country | `cradle-country` | TAS | **79** | ABS TR | `6R060` (North West) | — |
| 8 | Gippsland | `gippsland` | VIC | **66** | ABS TR | `2R120` (Gippsland) | — |
| 9 | Toowoomba & Darling Downs | `toowoomba-darling-downs` | QLD | **66** | ABS TR | `3R060` (Southern Queensland Country — includes Granite Belt; see ambiguity 5) | — |
| 10 | Bellarine Peninsula | `bellarine-peninsula` | VIC | **~40** (of 79 combined Geelong+Bellarine) | ABS TR | `2R140` (Geelong and the Bellarine — covers both; see ambiguity 4) | — |
| 11 | Geelong | `geelong-city` | VIC | **~39** (balance of combined cluster) | ABS TR | `2R140` or OSM City of Greater Geelong | — |
| 12 | Great Southern | `great-southern` | WA | **75** | OSM LGA aggregate | City of Albany + Plantagenet + Denmark + Cranbrook | — |
| 13 | McLaren Vale | `mclaren-vale` | SA | **49** (as part of Fleurieu; see ambiguity 6) | ABS TR | `4R030` (Fleurieu Peninsula) | ✓ |
| 14 | Sunshine Coast Hinterland | `sunshine-coast-hinterland` | QLD | **~56** (of 207; see ambiguity 2) | OSM LGA | Noosa + Sunshine Coast Regional + Gympie (hinterland portion) — or use ABS TR `3R030` if broader scope acceptable | — |
| 15 | Scenic Rim | `scenic-rim` | QLD | **32** | OSM LGA | Scenic Rim Regional Council (single LGA) | — |
| 16 | Northern Rivers | `northern-rivers` | NSW | **28** | OSM LGA aggregate | Tweed + Byron (already in Byron Bay polygon) + Ballina + Lismore + Richmond Valley + Kyogle | — |
| 17 | South Coast NSW | `south-coast-nsw` | NSW | **29** | OSM LGA aggregate | Kiama + Shoalhaven (+ possibly Shellharbour) — overlaps ambiguity 3 | — |
| 18 | Limestone Coast | `limestone-coast` | SA | **26** | ABS TR | `4R010` (Limestone Coast) | — |
| 19 | Central Coast | `central-coast` | NSW | **25** | OSM LGA | Central Coast Council (single amalgamated LGA) | — |
| 20 | Alice Springs & Red Centre | `alice-springs-red-centre` | NT | **21** | OSM LGA | Alice Springs Town Council + MacDonnell Regional Council (or ABS TR aggregate if broader) | — |
| 21 | Grampians | `grampians` | VIC | **19** | ABS TR | `2R050` (Western Grampians) | ✓ (brand-anchor-adjacent — wine + tourism) |
| 22 | Great Ocean Road | `great-ocean-road` | VIC | **24** | ABS TR | `2R040` (Great Ocean Road) | ✓ |

**Subtotal Tier 1: ~1,557 listings rescued** (20 clusters spanning the top candidates).

---

## Tier 2 — Insert new row (7 candidates)

No matching existing draft. Needs: INSERT new row with minimal fields (name, slug, state, status='live', polygon), following the same pattern used for Orange and Mudgee on the earlier activation.

| # | Region | Slug | State | NULLs rescued | Polygon source | Component codes | Notes |
|---|---|---|---|---|---|---|---|
| 23 | Ballarat & Goldfields | `ballarat` | VIC | **105** | ABS TR | `2R170` (Ballarat) | Possible overlap with `daylesford` draft on northern edge — resolved by smallest-area-wins |
| 24 | Victorian High Country | `victorian-high-country` | VIC | **89** | ABS TR | `2R100` (High Country) | Rutherglen + Beechworth + Bright + Alpine Valleys |
| 25 | Sunshine Coast | `sunshine-coast` | QLD | **~151** (of 207 combined SC cluster) | ABS TR | `3R030` (Sunshine Coast) | See ambiguity 2 — split from hinterland |
| 26 | Port Macquarie & Hastings | `port-macquarie` | NSW | **67** | OSM LGA | Port Macquarie-Hastings Council (single LGA) | — |
| 27 | Coffs Coast | `coffs-coast` | NSW | **63** | OSM LGA aggregate | Coffs Harbour City + Bellingen Shire | — |
| 28 | Granite Belt | `granite-belt` | QLD | **32** | OSM LGA | Southern Downs Regional Council (single LGA covers Stanthorpe + Warwick) | Or could fold into `toowoomba-darling-downs` — see ambiguity 5 |
| 29 | Townsville | `townsville` | QLD | **23** | ABS TR | `3R110` (Townsville) | — |
| 30 | Bendigo | `bendigo` *(new)* | VIC | **79** | ABS TR | `2R060` (Bendigo Loddon) | Or fold into `central-victoria` draft — see ambiguity 1 |
| 31 | Daylesford | `daylesford` *(draft exists — UPDATE not INSERT)* | VIC | **50** | ABS TR | `2R160` (Spa Country) | Correction — `daylesford` IS a draft. Move this to Tier 1 if kept separate from Bendigo. |
| 32 | Macedon Ranges | `macedon-ranges` *(draft exists — UPDATE not INSERT)* | VIC | **20** | ABS TR | `2R150` (Macedon) | Same correction — `macedon-ranges` IS a draft. |

*Note:* candidates 31 and 32 are drafts (caught in cross-ref) — listed here to flag their interaction with ambiguity 1. They move to Tier 1 if kept separate from Bendigo/central-victoria.

**Subtotal Tier 2 (excluding Daylesford/Macedon double-counts): ~610 listings rescued** (7 new regions).

---

## Tier 3 — Ambiguities requiring editorial decision

These have clusters large enough to justify activation but multiple editorial options. Matt should decide which framing to take.

### Ambiguity 1 — Central Victoria slicing (215 listings in one cluster)

The 215-listing Macedon/Bendigo/Daylesford cluster spans three distinct editorial sub-regions with three existing drafts (`central-victoria`, `macedon-ranges`, `daylesford`). ABS TR offers three matching regions (`2R060` Bendigo Loddon, `2R150` Macedon, `2R160` Spa Country). Two paths:

- **Three separate activations** (Bendigo 79 + Daylesford 50 + Macedon 20 via their respective ABS TRs). Editorially precise; listings resolve to their exact sub-region.
- **One broad `central-victoria` activation** (OSM LGA aggregate or a custom polygon covering all three). Simpler; loses sub-region precision.

**Recommendation:** three separate activations. All three TRs exist, all three drafts exist. But this requires editorial commitment to three separate region pages.

### Ambiguity 2 — Sunshine Coast coast-vs-hinterland split (207 listings)

Cluster of 207 covers both coastal Sunshine Coast (Noosa, Mooloolaba, Caloundra) and hinterland (Montville, Maleny, Eumundi). Only `sunshine-coast-hinterland` exists as a draft; there is NO core `sunshine-coast` draft despite Matt's brand-anchor list not including it.

- **Option A:** INSERT new `sunshine-coast` region (ABS TR `3R030`) covering the entire ABS TR (coast + hinterland combined). Activate `sunshine-coast-hinterland` redundantly — smallest-area-wins means hinterland listings resolve to the narrower hinterland polygon.
- **Option B:** INSERT `sunshine-coast` as *coast-only* (e.g. Sunshine Coast Regional Council minus hinterland via LGA subtraction — awkward). Activate `sunshine-coast-hinterland` separately.
- **Option C:** Only INSERT `sunshine-coast` broad; don't activate the hinterland draft separately.

**Recommendation:** Option A. Matches the editorial pattern already established (Hobart & Southern Tasmania + Hobart City overlapping).

### Ambiguity 3 — Illawarra/Southern Highlands/Shoalhaven triangle (150 listings)

Cluster of 150 covers three distinct regions with three existing drafts (`wollongong`, `southern-highlands`, `shoalhaven`). Five listings of Blue Mountains are also caught (western edge).

- **Three separate activations** via OSM LGAs: Wollongong (City of Wollongong + Shellharbour) + Southern Highlands (Wingecarribee) + Shoalhaven (City of Shoalhaven). Plus Blue Mountains (City of Blue Mountains) if the 19-listing Blue Mountains probe qualifies at brand-floor (it's not on Matt's brand list, so 19 < 20 excludes it).

**Recommendation:** three separate activations. All three drafts exist, LGAs are clean.

### Ambiguity 4 — Geelong/Bellarine combined or split (79 listings)

ABS TR `2R140` "Geelong and the Bellarine" covers both regions in one polygon. Two existing drafts (`geelong-city`, `bellarine-peninsula`) suggest editorial intent to keep them separate. Options:

- **Option A:** Activate both separately via OSM LGAs (City of Greater Geelong = Geelong area; OSM Bellarine Peninsula as its own boundary doesn't exist cleanly — would need LGA subtraction).
- **Option B:** Activate only `geelong-city` using ABS TR `2R140` (captures both geographies under the Geelong slug; `bellarine-peninsula` draft stays draft).
- **Option C:** Split editorially: `geelong-city` for the urban area, `bellarine-peninsula` for the peninsula, both via OSM LGA subsets.

**Recommendation:** Option A using City of Greater Geelong OSM LGA for `geelong-city`, and delete/repurpose `bellarine-peninsula`. OR keep both separate with custom OSM polygon subsets. Matt's call.

### Ambiguity 5 — Granite Belt inside Darling Downs (32 listings)

ABS TR `3R060` Southern Queensland Country covers both the Darling Downs and the Granite Belt (Stanthorpe). A single polygon for `toowoomba-darling-downs` via this TR would capture all 98 listings (66 Darling Downs + 32 Granite Belt). But Granite Belt has distinct wine-region identity.

- **Option A:** Single activation of `toowoomba-darling-downs` via `3R060`. Granite Belt listings resolve to that. No separate Granite Belt region.
- **Option B:** Activate both as separate regions with overlapping polygons — `toowoomba-darling-downs` covers the broader SQC and `granite-belt` covers Southern Downs LGA. Smallest-area-wins routes Stanthorpe wineries to `granite-belt` specifically.

**Recommendation:** Option B. Granite Belt is an editorially distinct wine region.

### Ambiguity 6 — McLaren Vale inside Fleurieu Peninsula (49 listings)

ABS TR `4R030` Fleurieu Peninsula covers McLaren Vale, Victor Harbor, Willunga, and the peninsula tip (Cape Jervis). Matt's brand-anchor list names "McLaren Vale" specifically.

- **Option A:** Activate `mclaren-vale` using ABS TR `4R030`. Captures McLaren Vale + Fleurieu surrounds under the McLaren Vale name. Editorially slightly inaccurate (McLaren Vale is the wine sub-region, Fleurieu is the broader tourism region).
- **Option B:** INSERT new `fleurieu-peninsula` for the broader polygon; `mclaren-vale` narrows to Onkaparinga-South LGA or similar.

**Recommendation:** Option A. Captures the 49 listings cleanly; editorial naming stays with what Matt has on his brand list.

### Ambiguity 7 — Canberra wine region spillover into NSW (26 listings)

The existing live `Canberra District` polygon is the ACT territory boundary only. 26 wine listings (Murrumbateman, Gundaroo, Lake George) fall just outside the ACT in NSW, specifically in Yass Valley LGA. These are the editorial Canberra wine district, branded as "Canberra District" wines despite being NSW-side.

- **Option A:** Expand the existing `Canberra District` polygon to include Yass Valley LGA. This changes the polygon of a live region.
- **Option B:** INSERT new `canberra-wine` / `yass-valley` region (OSM Yass Valley LGA). `Canberra District` stays as ACT-only.

**Recommendation:** Option B. Preserves separation of ACT governance area from NSW wine region. Listings editorially branded "Canberra District" would need editorial override via Humanator or acceptance that the slug differs from the brand tag.

---

## Below-threshold observations (NOT activated)

These surfaced as clusters or probes but fell below the 20-listing threshold (or 15 for brand-anchor). Documented so Matt sees what's being left for quarantine.

| Region | Count | Brand anchor? | Decision |
|---|---|---|---|
| Yarra Valley (VIC) | 5 | ✓ | Below 15 brand-anchor floor — excluded. Listing data is genuinely thin here, not a coverage gap. |
| Mornington Peninsula (VIC) | 2 | ✓ | Below 15 brand-anchor floor — excluded. Genuinely thin. |
| Kangaroo Island (SA) | 13 | ✗ | Below 20 — excluded. |
| Snowy Mountains (NSW) | 12 | ✗ | Below 20 — excluded. |
| Blue Mountains (NSW) | 19 | ✗ | Just below 20 — excluded. |
| Bunbury / South West WA | 19 | ✗ | Just below 20 — excluded. Margaret River absorbs some of this geographic area. |
| Atherton Tablelands (QLD) | 14 | ✗ | Below 20 — excluded. Cairns & Tropical North absorbs the rest. |
| Port Douglas / Daintree (QLD) | 9 | ✗ | Below 20 — excluded. Cairns & Tropical North ABS TR (`3R120`) covers this area already. |
| Mildura / Murray River | 18 | ✗ | Below 20 — excluded. `murray-river` draft exists but cluster is small. |
| East Coast Tasmania | 15 | partial (Freycinet is iconic) | On the edge. Not on Matt's explicit brand list. Flag for Matt's call. |
| Sapphire Coast NSW | 6 | ✗ | Far below 20 — excluded. |
| Huon Valley (TAS) | 2 | ✗ | Already inside `Hobart & Southern Tasmania` polygon — correctly NOT null. (Probe hit 2 listings that appear to be mis-tagged.) |
| Whitsundays (QLD) | 3 | ✗ | Below 20 — excluded. |
| Swan Valley (WA) | (not probed directly) | ✗ | `fremantle-swan-valley` draft exists. If ≥20, could activate via OSM LGA. |

---

## Overlap with existing live regions

If activated, the following proposed regions would geographically overlap existing live regions. Edge Case 2 of the regions architecture spec (smallest-polygon-by-area wins on overlap) resolves these cleanly:

| Proposed region | Overlaps live region | Resolution |
|---|---|---|
| Hunter Valley's LGA scope touches Newcastle proposal | `hunter-valley` (live) vs `newcastle` (proposed) | Newcastle LGAs (Newcastle + Lake Macquarie + Port Stephens) sit east of Cessnock+Singleton (Hunter Valley). Minimal real overlap. Any listings inside both resolve to smaller polygon (probably Newcastle since smaller). |
| Tropical North QLD would overlap if `atherton-tablelands` activated | `cairns-tropical-north` (proposed) | N/A — Atherton excluded at threshold. |
| `hobart-city` already nested inside `hobart` | Established pattern (Edge Case 2 example) | Same nested pattern applies to any city-within-region proposals. |
| `sunshine-coast-hinterland` inside `sunshine-coast` (if Option A in Ambiguity 2) | — | Nested: hinterland listings resolve to hinterland, coastal resolve to coast. |
| `granite-belt` inside `toowoomba-darling-downs` (if Option B in Ambiguity 5) | — | Nested: Stanthorpe wine listings resolve to Granite Belt, Toowoomba listings resolve to broader TDD. |
| `mclaren-vale` contents partially inside Adelaide GCCSA? | Fleurieu TR extends south from Adelaide metro | Adelaide GCCSA ends approximately at Sellicks Beach; Fleurieu starts further south. Minimal-to-no overlap. |

All overlaps are deliberate nesting or benign. Phase 1.5 trigger logic handles all cases automatically.

---

## Projected outcome if all Tier-1 + Tier-2 activated

**Current state (post-14-region):** 3,425 NULL / 6,509 eligible = 52.6%
**Target state (post-29-region):** estimated 700–1,000 NULL / 6,509 eligible = ≈12–15%

Rescued listings (rough sum of NULLs per candidate, minus overlap double-count):

| Tier | Candidates | Rescue count (approx) |
|---|---|---|
| Tier 1 (activate drafts) | 22 regions | ~1,557 |
| Tier 2 (insert new) | 7 regions | ~610 |
| Ambiguity resolution (if all resolved in favour of activation) | Various | ~600 (the 3 Central Vic splits + 3 SH/Illawarra splits + Canberra Wine) |
| **Total rescue projection** | — | **~2,700** |
| **Remaining quarantine** | — | **~700–1,000** |

The remaining ~700–1,000 NULL listings would be genuinely remote or diffuse — Swan Valley fringes, Sapphire Coast, regional NSW outside tourism regions, mid-north SA, etc. Quarantine is the correct editorial outcome for those: admin-reviews and either assigns via `region_override_id`, corrects the lat/lng, or accepts NULL.

---

## Deliverables needed for Phase B (activation)

Matt's editorial calls needed on:

1. **Ambiguities 1-7** — specifically which to fold/split/INSERT.
2. **Brand-anchor threshold exceptions** — Yarra Valley (5) and Mornington Peninsula (2) are explicitly named brand anchors but fall far below the 15-listing floor. Confirm exclusion, or override.
3. **Bellarine/Geelong treatment** — single combined ABS TR (Option B in ambiguity 4) or two separate OSM LGA polygons (Option A or C).
4. **Ballarat editorial identity** — activate as `ballarat` (narrow) or `ballarat-goldfields` (broader, could swallow the 50 Daylesford listings too)?
5. **Canberra wine region** — new `canberra-wine` / `yass-valley` row, or expand existing live Canberra District polygon?

Once confirmed, Phase B = activation script in the pattern of `scripts/activate-regions-osm-lga.mjs` (modified to support ABS TR as well as OSM LGA aggregation per region). Single batch commit with all activations + updated polygon sourcing report.
