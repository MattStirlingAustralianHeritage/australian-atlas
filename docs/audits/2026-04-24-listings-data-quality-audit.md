# Listings data-quality audit — 2026-04-24

**Scope:** all rows in the portal `listings` table (across all nine verticals, all statuses).
**Mode:** read-only. No writes, no fixes. Output is this report + a per-flag CSV at `docs/audits/2026-04-24-listings-flags.csv`.

## 1. Executive summary

| Metric | Value |
|---|---|
| Total listings audited | **6567** |
| Total flags raised | **10716** |
| Distinct listings flagged | **6562** (99.9%) |
| Flags per flagged listing (avg) | **1.63** |

### Listing status distribution (context)

- active: 6544
- hidden: 23

### Per-vertical: listing count + total flags

| Vertical | Listings | Flags | Avg flags/listing |
|---|---:|---:|---:|
| collection | 974 | 1643 | 1.69 |
| corner | 193 | 507 | 2.63 |
| craft | 2346 | 2512 | 1.07 |
| field | 221 | 465 | 2.10 |
| fine_grounds | 161 | 365 | 2.27 |
| found | 179 | 344 | 1.92 |
| rest | 272 | 862 | 3.17 |
| sba | 2155 | 3773 | 1.75 |
| table | 66 | 245 | 3.71 |

## 2. Per-check summary

Each check's hit count, breakdown by vertical, and 3-5 concrete examples.

### Check 1 — `name_null_or_empty` (structural)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 2 — `slug_null_or_invalid_format` (structural)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 3 — `slug_duplicated_across_verticals` (structural)

**Total: 100** — by vertical: craft=48, collection=40, sba=7, found=2, corner=1, field=1, rest=1

- **Mbantua Gallery** (collection, active) — slug `mbantua-gallery` — value: `slug "mbantua-gallery" appears in verticals: collection, craft`
- **Mbantua Gallery** (craft, active) — slug `mbantua-gallery` — value: `slug "mbantua-gallery" appears in verticals: collection, craft`
- **The Paperback Bookshop** (found, active) — slug `the-paperback-bookshop` — value: `slug "the-paperback-bookshop" appears in verticals: corner, found`
- **The Paperback Bookshop** (corner, active) — slug `the-paperback-bookshop` — value: `slug "the-paperback-bookshop" appears in verticals: corner, found`
- **PICA — Perth Institute of Contemporary Arts** (collection, active) — slug `pica-perth-institute-of-contemporary-arts` — value: `slug "pica-perth-institute-of-contemporary-arts" appears in verticals: collection, craft`

### Check 4 — `slug_duplicated_within_vertical` (structural)

**Total: 14** — by vertical: collection=10, fine_grounds=2, craft=2

- **Paramount Coffee Project** (fine_grounds, active) — slug `paramount-coffee-project` — value: `slug "paramount-coffee-project" appears 2× in vertical fine_grounds`
- **Paramount Coffee Project** (fine_grounds, active) — slug `paramount-coffee-project` — value: `slug "paramount-coffee-project" appears 2× in vertical fine_grounds`
- **Penrith Regional Gallery — The Lewers Bequest** (collection, active) — slug `penrith-regional-gallery-the-lewers-bequest` — value: `slug "penrith-regional-gallery-the-lewers-bequest" appears 2× in vertical collection`
- **Penrith Regional Gallery & The Lewers Bequest** (collection, active) — slug `penrith-regional-gallery-the-lewers-bequest` — value: `slug "penrith-regional-gallery-the-lewers-bequest" appears 2× in vertical collection`
- **Gertrude Contemporary** (collection, active) — slug `gertrude-contemporary` — value: `slug "gertrude-contemporary" appears 2× in vertical collection`

### Check 5 — `vertical_not_canonical` (structural)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 6 — `status_not_canonical` (structural)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 7 — `visitable_null` (structural)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 8 — `visitable_true_lat_null` (geographic)

**Total: 31** — by vertical: field=10, craft=6, collection=5, corner=3, rest=3, fine_grounds=2, sba=1, found=1

- **Paramount Coffee Project** (fine_grounds, active) — slug `paramount-coffee-project` — value: ``
- **Mitchell Plateau Aboriginal Rock Art Trail** (field, active) — slug `mitchell-plateau-aboriginal-rock-art-trail` — value: ``
- **Mostly Books** (corner, active) — slug `mostly-books` — value: ``
- **Halls Gap Lakeside** (rest, active) — slug `halls-gap-lakeside` — value: ``
- **Canberra Quilters Collective** (craft, active) — slug `canberra-quilters-collective` — value: ``

### Check 9 — `visitable_true_lng_null` (geographic)

**Total: 31** — by vertical: field=10, craft=6, collection=5, corner=3, rest=3, fine_grounds=2, sba=1, found=1

- **Paramount Coffee Project** (fine_grounds, active) — slug `paramount-coffee-project` — value: ``
- **Mitchell Plateau Aboriginal Rock Art Trail** (field, active) — slug `mitchell-plateau-aboriginal-rock-art-trail` — value: ``
- **Mostly Books** (corner, active) — slug `mostly-books` — value: ``
- **Halls Gap Lakeside** (rest, active) — slug `halls-gap-lakeside` — value: ``
- **Canberra Quilters Collective** (craft, active) — slug `canberra-quilters-collective` — value: ``

### Check 10 — `visitable_true_lat_out_of_bounds` (geographic)

**Total: 1** — by vertical: craft=1

- **Silverkupe Studio -Jewellery & Workshops** (craft, active) — slug `silverkupe-studio-jewellery-and-workshops` — value: `54.976072`

### Check 11 — `visitable_true_lng_out_of_bounds` (geographic)

**Total: 1** — by vertical: craft=1

- **Silverkupe Studio -Jewellery & Workshops** (craft, active) — slug `silverkupe-studio-jewellery-and-workshops` — value: `-1.5970422`

### Check 12 — `visitable_true_state_not_canonical` (geographic)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 13 — `region_contains_digit` (region)

**Total: 538** — by vertical: rest=185, corner=98, table=58, found=53, fine_grounds=45, collection=38, craft=26, field=24, sba=11

- **Raynella Alpaca Farmstay B & B** (rest, active) — slug `raynella-alpaca-farmstay-b-b` — value: `54 Ingram Rd`
- **Bottom of the Harbour Antiques** (found, active) — slug `bottom-of-the-harbour-antiques` — value: `46 Red Ln`
- **The Best Little Bookshop In Town** (corner, active) — slug `the-best-little-bookshop-in-town` — value: `97 Cronulla St`
- **Closeburn House** (rest, active) — slug `closeburn-house` — value: `2 Closeburn Dr`
- **Red Mud Coffee Roasters** (fine_grounds, active) — slug `red-mud-coffee-roasters` — value: `43 McCarthy Road, Maleny`

### Check 14 — `region_contains_street_suffix` (region)

**Total: 565** — by vertical: rest=190, corner=94, table=58, found=52, collection=51, fine_grounds=43, field=35, craft=28, sba=14

- **Cubby and Co at Mount Majura Vineyard** (rest, active) — slug `cubby-and-co-at-mount-majura-vineyard` — value: `Lime Kiln Rd, Australian Capital Territory`
- **Raynella Alpaca Farmstay B & B** (rest, active) — slug `raynella-alpaca-farmstay-b-b` — value: `54 Ingram Rd`
- **Bottom of the Harbour Antiques** (found, active) — slug `bottom-of-the-harbour-antiques` — value: `46 Red Ln`
- **The Best Little Bookshop In Town** (corner, active) — slug `the-best-little-bookshop-in-town` — value: `97 Cronulla St`
- **Closeburn House** (rest, active) — slug `closeburn-house` — value: `2 Closeburn Dr`

### Check 15 — `region_not_in_regions_table` (region)

**Total: 2870** — by vertical: sba=1586, collection=524, rest=222, field=164, fine_grounds=108, corner=100, table=61, found=56, craft=49

- **Cedar Fox Distilling Co.** (sba, active) — slug `cedar-fox-distilling-co` — value: `Coburg North`
- **Cubby and Co at Mount Majura Vineyard** (rest, active) — slug `cubby-and-co-at-mount-majura-vineyard` — value: `Lime Kiln Rd, Australian Capital Territory`
- **Raynella Alpaca Farmstay B & B** (rest, active) — slug `raynella-alpaca-farmstay-b-b` — value: `54 Ingram Rd`
- **Mount Nathan Winery** (sba, active) — slug `mount-nathan-winery` — value: `Mount Nathan`
- **Port Macquarie Regional Museum** (collection, active) — slug `port-macquarie-regional-museum` — value: `Port Macquarie`

### Check 16 — `region_computed_id_fk_broken` (cross_table)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 17 — `region_override_id_fk_broken` (cross_table)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 18 — `website_url_malformed` (cross_table)

**Total: 0**

_(no examples — check triggered 0 times)_

### Check 19 — `sub_type_not_in_vertical_canonical` (coherence)

**Total: 15** — by vertical: corner=14, sba=1

- **Newtown Art Supplies** (corner, hidden) — slug `newtown-art-supplies` — value: `art_supplies`
- **Clipboard Office & Art Supplies** (corner, hidden) — slug `clipboard-office-art-supplies` — value: `art_supplies`
- **Art Shed** (corner, hidden) — slug `art-shed` — value: `art_supplies`
- **Senior Art Supplies** (corner, hidden) — slug `senior-art-supplies` — value: `art_supplies`
- **Vibrance – Graffiti & Street Art Supplies** (corner, hidden) — slug `vibrance-graffiti-street-art-supplies` — value: `art_supplies`

### Check 20 — `hero_image_url_null` (signal)

**Total: 6545** — by vertical: craft=2345, sba=2152, collection=970, rest=258, field=221, corner=193, found=179, fine_grounds=161, table=66

- **Hoskings Jewellers** (craft, active) — slug `hoskings-jewellers-vic` — value: ``
- **Ballarat Custom Furniture and Restoration** (craft, active) — slug `ballarat-custom-furniture-and-restoration` — value: ``
- **Cedar Fox Distilling Co.** (sba, active) — slug `cedar-fox-distilling-co` — value: ``
- **Creative Play & Art Centre Ballarat** (craft, active) — slug `creative-play-and-art-centre-ballarat` — value: ``
- **Cubby and Co at Mount Majura Vineyard** (rest, active) — slug `cubby-and-co-at-mount-majura-vineyard` — value: ``

### Check 21 — `description_null_or_empty` (signal)

**Total: 5** — by vertical: fine_grounds=2, table=2, corner=1

- **Zentveld's Coffee Farm & Roastery** (fine_grounds, active) — slug `zentvelds-coffee-farm-roastery` — value: ``
- **Joan's Pantry** (table, active) — slug `joans-pantry` — value: ``
- **Tasmanian Produce Market** (table, active) — slug `tasmanian-produce-market` — value: ``
- **Goliath Coffee Roasters** (fine_grounds, active) — slug `goliath-coffee-roasters` — value: ``
- **The Social Outfit** (corner, active) — slug `the-social-outfit` — value: ``

### Check 22 — `stale_updated_at_over_12_months` (signal)

**Total: 0**

_(no examples — check triggered 0 times)_

## 3. Per-vertical health profile

### collection (974 listings, 1643 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 970 | `hero_image_url_null` |
| 15 | 524 | `region_not_in_regions_table` |
| 14 | 51 | `region_contains_street_suffix` |
| 3 | 40 | `slug_duplicated_across_verticals` |
| 13 | 38 | `region_contains_digit` |
| 4 | 10 | `slug_duplicated_within_vertical` |
| 8 | 5 | `visitable_true_lat_null` |
| 9 | 5 | `visitable_true_lng_null` |

### corner (193 listings, 507 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 193 | `hero_image_url_null` |
| 15 | 100 | `region_not_in_regions_table` |
| 13 | 98 | `region_contains_digit` |
| 14 | 94 | `region_contains_street_suffix` |
| 19 | 14 | `sub_type_not_in_vertical_canonical` |
| 8 | 3 | `visitable_true_lat_null` |
| 9 | 3 | `visitable_true_lng_null` |
| 3 | 1 | `slug_duplicated_across_verticals` |
| 21 | 1 | `description_null_or_empty` |

### craft (2346 listings, 2512 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 2345 | `hero_image_url_null` |
| 15 | 49 | `region_not_in_regions_table` |
| 3 | 48 | `slug_duplicated_across_verticals` |
| 14 | 28 | `region_contains_street_suffix` |
| 13 | 26 | `region_contains_digit` |
| 8 | 6 | `visitable_true_lat_null` |
| 9 | 6 | `visitable_true_lng_null` |
| 4 | 2 | `slug_duplicated_within_vertical` |
| 10 | 1 | `visitable_true_lat_out_of_bounds` |
| 11 | 1 | `visitable_true_lng_out_of_bounds` |

### field (221 listings, 465 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 221 | `hero_image_url_null` |
| 15 | 164 | `region_not_in_regions_table` |
| 14 | 35 | `region_contains_street_suffix` |
| 13 | 24 | `region_contains_digit` |
| 8 | 10 | `visitable_true_lat_null` |
| 9 | 10 | `visitable_true_lng_null` |
| 3 | 1 | `slug_duplicated_across_verticals` |

### fine_grounds (161 listings, 365 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 161 | `hero_image_url_null` |
| 15 | 108 | `region_not_in_regions_table` |
| 13 | 45 | `region_contains_digit` |
| 14 | 43 | `region_contains_street_suffix` |
| 4 | 2 | `slug_duplicated_within_vertical` |
| 8 | 2 | `visitable_true_lat_null` |
| 9 | 2 | `visitable_true_lng_null` |
| 21 | 2 | `description_null_or_empty` |

### found (179 listings, 344 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 179 | `hero_image_url_null` |
| 15 | 56 | `region_not_in_regions_table` |
| 13 | 53 | `region_contains_digit` |
| 14 | 52 | `region_contains_street_suffix` |
| 3 | 2 | `slug_duplicated_across_verticals` |
| 8 | 1 | `visitable_true_lat_null` |
| 9 | 1 | `visitable_true_lng_null` |

### rest (272 listings, 862 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 258 | `hero_image_url_null` |
| 15 | 222 | `region_not_in_regions_table` |
| 14 | 190 | `region_contains_street_suffix` |
| 13 | 185 | `region_contains_digit` |
| 8 | 3 | `visitable_true_lat_null` |
| 9 | 3 | `visitable_true_lng_null` |
| 3 | 1 | `slug_duplicated_across_verticals` |

### sba (2155 listings, 3773 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 2152 | `hero_image_url_null` |
| 15 | 1586 | `region_not_in_regions_table` |
| 14 | 14 | `region_contains_street_suffix` |
| 13 | 11 | `region_contains_digit` |
| 3 | 7 | `slug_duplicated_across_verticals` |
| 8 | 1 | `visitable_true_lat_null` |
| 9 | 1 | `visitable_true_lng_null` |
| 19 | 1 | `sub_type_not_in_vertical_canonical` |

### table (66 listings, 245 flags)

| Check | Hits | Check name |
|---:|---:|---|
| 20 | 66 | `hero_image_url_null` |
| 15 | 61 | `region_not_in_regions_table` |
| 13 | 58 | `region_contains_digit` |
| 14 | 58 | `region_contains_street_suffix` |
| 21 | 2 | `description_null_or_empty` |

## 4. Cross-cutting observations

### Top flag categories (most hits)

| Rank | Check | Hits | Category |
|---:|---|---:|---|
| 1 | 20 `hero_image_url_null` | 6545 | signal |
| 2 | 15 `region_not_in_regions_table` | 2870 | region |
| 3 | 14 `region_contains_street_suffix` | 565 | region |
| 4 | 13 `region_contains_digit` | 538 | region |
| 5 | 3 `slug_duplicated_across_verticals` | 100 | structural |
| 6 | 8 `visitable_true_lat_null` | 31 | geographic |
| 7 | 9 `visitable_true_lng_null` | 31 | geographic |
| 8 | 19 `sub_type_not_in_vertical_canonical` | 15 | coherence |
| 9 | 4 `slug_duplicated_within_vertical` | 14 | structural |
| 10 | 21 `description_null_or_empty` | 5 | signal |

### Category totals

- signal: 6550
- region: 3973
- structural: 114
- geographic: 64
- coherence: 15
- cross_table: 0

### Concentration by vertical

| Vertical | Listings | Flags | Flags per listing |
|---|---:|---:|---:|
| table | 66 | 245 | 3.71 |
| rest | 272 | 862 | 3.17 |
| corner | 193 | 507 | 2.63 |
| fine_grounds | 161 | 365 | 2.27 |
| field | 221 | 465 | 2.10 |
| found | 179 | 344 | 1.92 |
| sba | 2155 | 3773 | 1.75 |
| collection | 974 | 1643 | 1.69 |
| craft | 2346 | 2512 | 1.07 |

## 5. Recommended priority order for cleanup

Ordered by (a) load-bearing impact on downstream features and (b) volume. Read-only audit — these are suggestions, not decisions.

1. **Region field contamination** (checks 13, 14, 15) — blocks the Phase 2 backfill for any listings whose `region` field still holds addresses/suburbs. Already partially mitigated by Phase 1.5 spatial trigger + Phase 1.7 validator, but existing rows won't self-heal. Consider a dedicated backfill job that pulls from `lat`/`lng` via `ST_Contains` against live region polygons.

2. **Sub-type outliers** (check 19) — Phase 1.7 validator rejects these going forward, but existing rows bypass validation (sync doesn't touch `sub_type` on update for unchanged values). Small volume, admin can bulk-recategorise via Humanator.

3. **Geographic integrity on visitable rows** (checks 8–12) — visitable=true listings without valid coordinates or state break the map, Plan My Stay, and `/regions/[slug]` pages silently. Fixable case-by-case via geocoding or flipping `visitable=false` where appropriate.

4. **URL malformed** (check 18) — easy mechanical fix: prepend `https://` if missing. Consider an automated repair script for listings where the only problem is the scheme prefix.

5. **Structural oddities** (checks 1–7) — usually 0–small counts; any hits are data-pipeline bugs worth chasing.

6. **Signals (checks 20–22)** — not errors, informational. `hero_image_url NULL` is by design for typographic cards. Stale `updated_at` is a nudge for enrichment pipelines, not a quality issue.

## Appendix — check definitions

| ID | Name | Category | Severity |
|---:|---|---|---|
| 1 | `name_null_or_empty` | structural | error |
| 2 | `slug_null_or_invalid_format` | structural | error |
| 3 | `slug_duplicated_across_verticals` | structural | error |
| 4 | `slug_duplicated_within_vertical` | structural | error |
| 5 | `vertical_not_canonical` | structural | error |
| 6 | `status_not_canonical` | structural | error |
| 7 | `visitable_null` | structural | error |
| 8 | `visitable_true_lat_null` | geographic | warning |
| 9 | `visitable_true_lng_null` | geographic | warning |
| 10 | `visitable_true_lat_out_of_bounds` | geographic | warning |
| 11 | `visitable_true_lng_out_of_bounds` | geographic | warning |
| 12 | `visitable_true_state_not_canonical` | geographic | warning |
| 13 | `region_contains_digit` | region | warning |
| 14 | `region_contains_street_suffix` | region | warning |
| 15 | `region_not_in_regions_table` | region | warning |
| 16 | `region_computed_id_fk_broken` | cross_table | error |
| 17 | `region_override_id_fk_broken` | cross_table | error |
| 18 | `website_url_malformed` | cross_table | error |
| 19 | `sub_type_not_in_vertical_canonical` | coherence | warning |
| 20 | `hero_image_url_null` | signal | signal |
| 21 | `description_null_or_empty` | signal | signal |
| 22 | `stale_updated_at_over_12_months` | signal | signal |

_Generated by `audit-listings-tmp.mjs`. Source of truth = portal `listings` + `regions` tables at run time. Re-runnable: `node audit-listings-tmp.mjs`._
