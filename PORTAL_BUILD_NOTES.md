# Australian Atlas Portal — Build Notes

## Schema Inspection Summary

### Table names per vertical
| Vertical | Table | ID Type |
|----------|-------|---------|
| SBA | venues | BIGINT |
| Collection | venues | UUID |
| Craft | venues | UUID |
| Fine Grounds | roasters + cafes | BIGSERIAL |
| Rest | properties | BIGSERIAL |
| Field | places | UUID |
| Corner | shops | UUID |
| Found | shops | BIGINT |
| Table | listings | UUID |

### Key inconsistencies handled by sync field maps
- **Coordinates**: `latitude/longitude` vs `lat/lng` — normalized to `lat/lng` in master
- **Region**: `sub_region` vs `region` vs `suburb+city` — normalized to `region`
- **Status**: `status` string vs `published` boolean — normalized to active/inactive/pending
- **Website**: `website` vs `website_url` — normalized to `website`
- **Claimed**: `is_claimed` vs `claimed` vs `owner_id` — normalized to boolean `is_claimed`
- **Social links**: JSONB objects vs individual text columns — not synced to core (vertical-specific)

### Collection + SBA share a Supabase instance
Both use the same `sqedqgbvmhtezqnjobeg.supabase.co` project with the same `venues` table.
The sync should filter by `type` to avoid double-counting, OR accept that both verticals
will sync the same rows (deduplicated by `vertical + source_id`).

### Fine Grounds has two tables
Roasters and cafes are separate tables. The sync handles both, prefixing source_id
with `roaster_` or `cafe_` to maintain uniqueness.

### Extensions in use
- pgvector: Only Craft Atlas (1536-dim) — the master DB also uses 1536-dim
- PostGIS/earthdistance: Craft Atlas uses `ll_to_earth()` — master DB uses PostGIS `st_point()`

---

## Data Quality Issues

1. **Missing coordinates** — No validation enforced on any vertical. Some listings will have null lat/lng and won't appear on the unified map or in spatial queries.

2. **Inconsistent region naming** — `sub_region` is free text across SBA, Collection, Craft, Fine Grounds, Rest. No canonical taxonomy. Values like "Yarra Valley" vs "yarra valley" vs "Yarra Ranges" may refer to the same area.

3. **No region taxonomy** — The regions table in the master DB provides a canonical list, but source verticals don't reference it. Region matching is text-based until GeoJSON polygons are added.

4. **Field Atlas has no commercial layer** — No claim flow, no auth, no tiers. All listings sync as `is_claimed = false`.

5. **Markets appear in both Found Atlas and Table Atlas** — The `is_market` flag handles cross-vertical market queries. Found Atlas markets have `category = 'market'`, Table Atlas markets have `category = 'market'`.

6. **Social links fragmented** — SBA/Collection/Craft/FG/Rest use `social_links` JSONB. Corner/Table use `instagram_handle` text. Found uses `instagram` + `facebook` text columns. Not synced to core listings table (available via extension tables).

7. **Listing tier values vary** — SBA: free/basic/standard/premium. Craft: free/standard. FG/Rest: basic/standard/premium. Found/Table: free/paid. Corner: free/standard/premium.

8. **Hero images may be missing** — No validation. Some listings will have null `hero_image_url`.

---

## Architecture Decisions

### Hybrid linking model (Option C)
- Portal has NO individual listing detail pages
- Portal cards are rich summaries that link out to vertical canonical pages
- Portal SEO is carried by regional pages, search, and editorial
- Each vertical's canonical meta tags should point to itself (verify across all verticals)

### One-directional sync
- Vertical DBs → master DB only
- Master DB never writes back to verticals
- `source_id + vertical` composite unique constraint is the sync anchor

### Phase 2 considerations (do not build now)
- Portal listing pages for high-value categories (accommodation, natural places)
- User accounts on the portal
- Saved listings / favourites
- Trip ownership (currently anonymous)
- Canonical tag handling if portal pages are added

### Regional pages require editorial review
- `reviewed` boolean on regions table defaults to false
- Regional page should only have status `live` once `reviewed = true`
- Generative content (intro, itinerary) needs human review before publishing
- CMS should have a region review interface (to be built)

### Embedding provider
- Schema uses 1536-dimensional vectors (OpenAI text-embedding-3-small compatible)
- The `syncEmbeddings.js` file has a placeholder for the actual API call
- Replace with OpenAI, Voyage AI, or another provider before first sync run
