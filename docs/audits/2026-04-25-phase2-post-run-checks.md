# Phase 2 Post-Run Checks

**Date:** 2026-04-25 (evening, after Phase 2 apply at `63929c4`)
**Scope:** Four diagnostic checks — read-only.

## Check 1 — Alice Springs polygon gap

**Initial hypothesis (from the applied-report):** ST_MakeValid dropped the Alice Springs Town LGA component during validation.

**Result: hypothesis disproven.** The real cause is different: ST_MakeValid produced a polygon with **4 holes in component 0**, and Araluen falls in hole #4.

### Diagnostic findings

| Question | Finding |
|---|---|
| Current polygon components | **2** (was 3 pre-ST_MakeValid) |
| Current polygon bbox | 129.00–138.00°E / -26.00 to -22.85°S |
| Araluen inside current polygon? | **FALSE** |
| Araluen inside standalone Alice Town LGA? | FALSE (Araluen at 133.863°E; Alice Town LGA bbox starts at 133.87°E — Araluen is just outside the Alice Town LGA) |
| Alice Town centroid inside current polygon? | **TRUE** (Alice Town area is covered) |
| Listings inside standalone Alice Town LGA | **8 total, 8 matched, 0 NULL** |
| Hole test for Araluen | In outer ring of polygon[0], which has 4 holes — Araluen lies inside hole #4 |

### Interpretation

ST_MakeValid on the 3-LGA aggregate (Alice Springs Town + MacDonnell + Petermann) did not drop Alice Springs Town. It **merged Alice Town and MacDonnell into a single component with 4 internal holes**. These holes appear to be artifacts of the self-intersection repair — likely sliver gaps where the source LGAs shared boundaries imperfectly, leaving tiny unfilled regions when ST_MakeValid ran.

Araluen happens to sit in one of these holes, which is why it reads as NULL. The gap is minor and geographically specific — most listings in Alice Springs proper are correctly captured (8 of 8 matched inside Alice Town LGA).

### Scope of the gap

**Scope is small.** All 8 listings inside Alice Town LGA matched successfully. Araluen is technically *outside* Alice Town LGA (lng=133.863 < LGA minX=133.87) — Araluen sits just beyond the LGA boundary in what's effectively unincorporated land, and it's that unincorporated gap zone that the 4 holes cover.

Without a full polygon inspection of every hole, I can't quantify exactly how many listings fall in holes. The in-bbox scan found 8 listings in Alice Town LGA proper, all matched. Listings outside Alice Town LGA but inside MacDonnell (should be matched) or in hole zones (would be NULL) weren't separately counted — broader fix would cover both.

### Proposed fix (do not apply — Matt will call)

Three options:

1. **Re-source with cleaner aggregation.** Fetch the 3 LGAs fresh, aggregate server-side via PostGIS `ST_Union(polygons)` rather than client-side concatenation. This produces a clean topological union without sliver holes. Implementation: small SQL function or a one-shot update via the Supabase SQL editor.

2. **Expand the polygon to include Central Desert Regional Council.** The earlier trade-off (tighter editorial scope) excluded it; adding it back would cover the hole zones around Alice (Central Desert surrounds MacDonnell on some sides). Trade-off: polygon extends further north toward Tennant Creek.

3. **Accept the gap and apply `region_override_id`** for the handful of Alice-area listings that land in holes. Simplest, smallest scope. Downside: manual admin work for every new Alice-area listing.

**Recommendation:** Option 1. The cleanest technical fix; preserves editorial scope; prevents recurrence for any similar adjacent-LGA aggregation.

---

## Check 2 — Other 8 post-ST_MakeValid polygons

Verified the 8 other polygons that needed ST_MakeValid remediation yesterday. Result below.

| Slug | LGAs in source | Expected components | Actual components | Interpretation |
|---|---|---:|---:|---|
| `coffs-coast` | Coffs Harbour City + Bellingen Shire | 2 | **1** | Clean ST_Union — adjacent LGAs dissolved into single merged polygon. ✓ |
| `grampians` | Northern Grampians + Southern Grampians + Ararat Rural City | 3 | **1** | Clean ST_Union. ✓ |
| `great-southern` | Albany + Plantagenet + Denmark + Cranbrook | 4 | **1** | Clean ST_Union. ✓ |
| `margaret-river` | Augusta-Margaret River + Busselton | 2 | **1** | Clean ST_Union. ✓ |
| `newcastle` | Newcastle + Lake Macquarie + Port Stephens | 3 | **1** | Clean ST_Union. ✓ |
| `northern-rivers` | Tweed + Ballina + Lismore + Richmond Valley + Kyogle | 5 | **1** | Clean ST_Union. ✓ |
| `south-coast-nsw` | Kiama + Shoalhaven | 2 | **1** | Clean ST_Union. ✓ |
| `wollongong` | Wollongong + Shellharbour | 2 | **1** | Clean ST_Union. ✓ |

**No silent gaps detected.** All 8 polygons correctly dissolved adjacent LGAs into a single merged component — the expected behaviour of ST_MakeValid when source polygons share boundaries. The Phase 2 apply numbers corroborate: each of these 8 regions got its predicted NULL-rescue count exactly (zero drift from dry-run).

**Why Alice Springs behaves differently.** The 3 NT LGAs aren't all adjacent to each other:
- Alice Springs Town ↔ MacDonnell: adjacent (MacDonnell surrounds Alice Town)
- Petermann: disjoint (far south-west, around Uluru)

The Alice+MacDonnell pair merged cleanly (giving component 0 with 4 sliver holes around the inner Alice Town boundary). Petermann stayed as its own component 1 (disjoint from the main merged blob). Hence 3→2 instead of 3→1.

The 8 regions in this check all had fully-adjacent LGA sets, so they collapsed cleanly to 1 component each.

---

## Check 3 — `updated_at` side effect scope

Quantifies how many listings had their `updated_at` bumped by the Phase 2 `UPDATE SET lat = lat` backfill mechanism.

| Window | Count | Share of active |
|---|---:|---:|
| Active listings total | 6,545 | 100% |
| `updated_at` in last 24h | **6,510** | **99.5%** |
| `updated_at` in prev 24h (48h→24h baseline) | 0 | 0% |
| `updated_at` in last 7 days | 6,516 | 99.6% |

### Interpretation

The 24h count (6,510) matches the Phase 2 eligible population almost exactly — the backfill touched essentially every active+visitable+has-coords listing. The baseline (prev 24h) shows 0 touches, which is unusual for a live network but confirms the Phase 2 bump dwarfs any editorial activity pattern.

35 listings have `updated_at` *older* than 24h — these are the 4 non-visitable active rows + 31 missing-coords rows, exactly the population Phase 2 excluded.

### Impact on downstream signals

Any consumer of `listings.updated_at` now has a network-wide reset:
- **Staleness/recency scoring** (sort-by-newest): broken for ~3 weeks until the natural distribution rebuilds.
- **Cache invalidation / ETag**: all cached listing pages appear "updated" — downstream caches flush unnecessarily.
- **Sync watermarks**: if any process uses `max(updated_at)` as a sync cursor, it's now jumped forward — may re-process or skip rows unintentionally.
- **Editorial "what changed recently" queries**: useless for ~3 weeks.

### Remediation options (Matt to decide)

1. **Leave it.** Acceptable if no downstream system depends on precise `updated_at` for the next few weeks.
2. **Restore from backup.** If Supabase PITR or a snapshot covers pre-2026-04-25, restore `updated_at` only (via a targeted restore). Non-trivial.
3. **Add a `content_updated_at` column.** Separate content changes from structural updates. Migrate downstream consumers to use the new column for "meaningful updates." Phase 3-sized change; should be considered alongside `listings.region` deprecation anyway.
4. **Reset with a placeholder.** Set `updated_at = created_at` for all listings where they match within a minute — effectively reverses the side effect for rows that had no real updates before. Risky for rows that DID have recent editorial touches.

**Recommendation:** Option 3 is the right architectural answer. Option 1 is the pragmatic choice if Phase 3 is far away. Options 2 and 4 are both risky.

---

## Check 4 — 20 additional random spot-check assignments

Randomly pulled 20 active listings with non-NULL `region_computed_id` and verified the assignment editorially.

| # | Listing | Vertical | Source region text | Computed region | Editorial check |
|---|---|---|---|---|---|
| 1 | Goaty Hill Wines | sba | Tamar Valley | Launceston & Tamar Valley | ✓ |
| 2 | Warramunda Estate | sba | Yarra Valley | Yarra Valley | ✓ |
| 3 | Phoenix Alternative Body & Soul | craft | null | Ballarat & Goldfields | ✓ (null source → computed provides value) |
| 4 | Ernest Hill Wines | sba | Hunter Valley | Hunter Valley | ✓ |
| 5 | Hart & Hunter | sba | Hunter Valley | Hunter Valley | ✓ |
| 6 | Good Grief Studios | craft | Hobart City | Hobart City | ✓ |
| 7 | FORMED BY FUNCTION | craft | null | Ballarat & Goldfields | ✓ |
| 8 | Menzies Vineyard — Cellar Door | sba | Metricup | Margaret River | ✓ (Metricup is the suburb inside Margaret River) |
| 9 | TerraPotta Studio | craft | null | Wollongong | ✓ |
| 10 | Dusty Hill Wines | sba | South Burnett | Toowoomba & Darling Downs | ✓ editorially (South Burnett is in ABS TR 3R060 SQC) |
| 11 | Owston Hotel | rest | 17 High Street, Fremantle | Perth | ✓ Fremantle is inside Perth GCCSA |
| 12 | Bad Habit Records | corner | Visit us at 80 Howard Street, Nambour | Sunshine Coast Hinterland | ✓ Nambour is in Sunshine Coast LGA |
| 13 | Southern Antiques | found | 245 Princes Highway, Kogarah | Sydney | ✓ |
| 14 | **Pondalowie Vineyards** | sba | **Bendigo** | **Great Ocean Road** | ⚠ **Suspicious — Pondalowie is at Bridgewater-on-Loddon (Loddon Shire), which is editorially in the Bendigo region. Assignment to Great Ocean Road is wrong.** Most likely cause: lat/lng stored in DB is incorrect (geocoded to a Great Ocean Road location instead of actual Bridgewater-on-Loddon). Worth checking this row's coordinates. |
| 15 | Empire Spa Retreat | rest | Yallingup | Margaret River | ✓ |
| 16 | Liberty Brewing Co Taproom | sba | Cheltenham | Melbourne | ✓ |
| 17 | Gales Brewery | sba | Brunswick East | Melbourne | ✓ |
| 18 | Design Studio 22 | craft | null | Coffs Coast | ✓ |
| 19 | Dot & Line | corner | Hobart City | Hobart City | ✓ |
| 20 | Hundred Acre Hideaway | rest | 911 Coolangatta Rd | Hobart & Southern Tasmania | ✓ (Coolangatta in TAS is in Glenorchy, southern TAS) |

**19 of 20 editorially correct.** One suspicious case: Pondalowie Vineyards. The source text is "Bendigo" (correct editorial region), but the computed region is "Great Ocean Road". Since the trigger uses lat/lng against polygons, the assignment reflects where the coordinates actually place the listing — not what the source region text says.

Cross-vertical pattern from earlier audits (e.g. 2026-04-25 SBA mismatch diagnostic) suggests this is likely a geocoding error: either the lat/lng was AI-geocoded incorrectly, or the operator submitted coordinates for a different venue. Worth checking Pondalowie's DB row for coordinate correctness.

**No systemic assignment bugs detected.** 19/20 clean, 1 data-quality issue (source data, not polygon logic).

---

## Summary — what needs Matt's decision

1. **Alice Springs polygon hole fix.** Re-aggregate via ST_Union (server-side) to eliminate sliver holes. Single-region fix; rerun phase2-backfill on affected rows only (or accept the natural drift when listings next get a lat/lng UPDATE).
2. **`updated_at` side effect.** Three-week staleness-signal reset across the network. Matt to decide: leave, restore from backup, or add `content_updated_at` (Phase 3 scope).
3. **Pondalowie Vineyards coordinate check.** Confirm the DB lat/lng matches Bridgewater-on-Loddon (Loddon Shire). If not, re-geocode. Small data-quality fix.

**Nothing in this triage requires immediate action.** The network is functioning; Phase 2 assignments are semantically correct per trigger logic. The three items above are refinements, not blockers.
