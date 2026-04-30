# Vertical sync audit — 2026-04-30

Phase 1 (read-only) audit of the eight remaining verticals before extending today's
Rest Atlas region-propagation pattern (`resolveRegionName` + `recordSyncAndRevalidate`
+ `/api/revalidate` endpoint) to the rest of the network.

The diagnostic question for each vertical: **does the portal's resolved region name
match what the vertical actually stores and renders for that listing?** The Mona
Farm bug — portal had `region_override_id → Southern Highlands`, Rest Atlas's
`properties.sub_region` had `Canberra` — generalises across the network in a
broader, pre-override form: portal computes a regional name via PostGIS
(`region_computed_id`), but most verticals were populated before that
infrastructure landed and still hold suburb-level legacy text in their region
columns.

## Headline findings

1. **None of the eight verticals has an `/api/revalidate` endpoint.** All eight
   need the same route added (the canonical Rest Atlas pattern).
2. **Region staleness is widespread**, not Mona-Farm-specific. Across the eight
   verticals, **49% – 96% of published listings** show a portal-resolved region
   that doesn't match the vertical's stored region/suburb text. The dominant
   pattern is portal computing the proper regional name (e.g. "Macedon Ranges",
   "Adelaide", "Hobart & Southern Tasmania") via PostGIS while the vertical
   carries a suburb name (e.g. "Woodend", "Thebarton", "Salamanca") or a raw
   street address.
3. **`region_override_id` is currently in use on exactly zero of the 8 verticals'
   listings** (Mona Farm is the only override anywhere in the network). The
   override→vertical chain we built today is therefore architecturally sound but
   has no second-listing data to verify against until more overrides are set.
   Phase 3 verification will need to *create* an override on a test listing per
   vertical to exercise the chain.
4. **Four verticals — Craft, Corner, Found, Table — have no region/sub_region
   column on their entity table.** They store only `suburb` (and sometimes
   `city`). The current sync writes `suburb: data.suburb || data.region`,
   conflating "this is a suburb" with "this is a region." These four cannot
   adopt the canonical pattern without a schema migration adding a region
   column. **Per the prompt's hard scope ("No migrations to vertical
   schemas. If a vertical is missing the columns it needs for the
   resolved-region pattern, surface that in the audit and halt"), Phase 2
   for these four halts pending editor decision.**
5. **The other four — SBA, Collection, Fine Grounds (roasters + cafes), Field —
   already have the right column** and can proceed straight to Phase 2.

## Per-vertical reports

Format for each:

> **{Vertical}** · github: {repo} · vercel project: {name} · canonical: {domain}
> Repo path: {filesystem path}
> Entity table: `{table}` on Supabase project `{ref}`
> Region columns present: `{...}`
> Detail render path: `{file}` — reads `{fields}`
> Sync mapping (portal `lib/sync/pushToVertical.js`): {summary}
> Pre-existing `/api/revalidate`: no
> Stats: published `{n}`, override-using `0`, computed `{n}`, legacy-text `{n}`,
> null `{n}`, stale-vs-portal `{n}` ({pct}%)
> Phase 2 readiness: {ready | blocked-on-schema}

---

### 1. Small Batch Atlas (`sba`)

- **GitHub:** [`MattStirlingAustralianHeritage/small-batch-atlas-next`](https://github.com/MattStirlingAustralianHeritage/small-batch-atlas-next)
- **Vercel project:** `small-batch-atlas-next`
- **Canonical domain:** `https://smallbatchatlas.com.au` (returns 307 to canonical scheme)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Small Batch Atlas/small-batch-atlas-next`
- **Entity table:** `venues` on Supabase project `sqedqgbvmhtezqnjobeg` (shared with Collection — distinguished by `type` filter)
- **Region columns present:** `sub_region`, `suburb`, `postcode`, `state`, `latitude`, `longitude`
- **Detail render path:** `app/venue/[slug]/page.js`
  - Reads `venue.sub_region` for hero/breadcrumb/title
  - Reads `venue.suburb || venue.sub_region` for the address block
- **Sync mapping** ([lib/sync/pushToVertical.js:317](lib/sync/pushToVertical.js:317)):
  - `sub_region: data.region` ← good, will get `regionResolution.name` after today's commit `02d715e`
  - `suburb: data.suburb || data.region` ← falls back to region if suburb empty
- **Pre-existing `/api/revalidate`:** no
- **Stats:** 2151 published, 0 overrides, 1840 computed, 312 legacy, 0 null, **1445 stale (67.2%)**
- **Stale samples:**
  - `blasta-brewing-production-hq-and-taproom`: portal "Perth" vs vertical "High Wycombe"
  - `gindu`: portal "Macedon Ranges" vs vertical "Woodend"
  - `brightstar-brewing`: portal "Adelaide" vs vertical "Thebarton"
- **Phase 2 readiness:** **READY**. Same pattern as Rest Atlas.

---

### 2. Collection Atlas (`collection`)

- **GitHub:** [`MattStirlingAustralianHeritage/atlas-collection`](https://github.com/MattStirlingAustralianHeritage/atlas-collection)
- **Vercel project:** `atlas-collection`
- **Canonical domain:** `https://collectionatlas.com.au` (200)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Collection Atlas`
- **Entity table:** `venues` on Supabase project `sqedqgbvmhtezqnjobeg` (shared with SBA — distinguished by `type` filter)
- **Region columns present:** `sub_region`, `suburb`, `postcode`, `state`, `latitude`, `longitude`
- **Detail render path:** `app/venue/[slug]/page.js`
  - Reads `venue.sub_region` for hero/breadcrumb/title
  - Reads `venue.suburb || venue.sub_region` for address block
- **Sync mapping** ([lib/sync/pushToVertical.js:332](lib/sync/pushToVertical.js:332)):
  - `sub_region: data.region` ← good
  - `suburb: data.suburb || data.region`
- **Pre-existing `/api/revalidate`:** no
- **Stats:** 962 published, 0 overrides, 647 computed, 324 legacy, 0 null, **604 stale (62.9%)**
- **Stale samples:**
  - `town-hall-gallery-hawthorn`: portal "Melbourne" vs vertical "Hawthorn"
  - `flecker-botanic-gardens`: portal "Cairns & Tropical North" vs vertical "Cairns"
  - `malmsbury-heritage-flour-mill`: portal "Macedon Ranges" vs vertical "Malmsbury"
- **Phase 2 readiness:** **READY**. Same pattern as Rest Atlas.

> Note: SBA and Collection share one Supabase project + table. Writes from one
> sync land in the other's view. This is intentional (the portal's typeFilter
> partitions them at read time). The /api/revalidate route still has to live in
> both repos because the ISR caches are per-Vercel-project.

---

### 3. Craft Atlas (`craft`) — **BLOCKED ON SCHEMA**

- **GitHub:** [`MattStirlingAustralianHeritage/craft-atlas`](https://github.com/MattStirlingAustralianHeritage/craft-atlas)
- **Vercel project:** `craft-atlas-jxbr`
- **Canonical domain:** `https://craftatlas.com.au` (returns 308 to canonical scheme)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Craft Atlas`
- **Entity table:** `venues` on Supabase project `lrytdhdwirkwplgizxho` (shared with the CMS DB)
- **Region columns present:** **`suburb` only** — NO `sub_region`, NO `region`
- **Detail render path:** `app/venue/[slug]/page.js`
  - Reads `venue.suburb` for hero/breadcrumb/title/address
  - There's a vestigial `venue.region` reference at line 308, but `region` is not in the select list and the column doesn't exist on the table — silently renders nothing
- **Sync mapping** ([lib/sync/pushToVertical.js:347](lib/sync/pushToVertical.js:347)):
  - `suburb: data.suburb || data.region` — region is conflated into suburb when suburb is empty
- **Pre-existing `/api/revalidate`:** no
- **Stats:** 2337 published, 0 overrides, 2197 computed, 18 legacy, 127 null, **2202 stale (94.3%)**
- **Phase 2 readiness:** **BLOCKED.** Adopting the canonical pattern requires
  adding `sub_region text` (or equivalent) to the `venues` table on
  `lrytdhdwirkwplgizxho`, then updating the render path to read it. Per scope:
  no schema migrations in this work block.
- **Recommendation:** add a follow-up migration to add `sub_region` to the
  CMS-DB `venues` table, plus a render-path PR to read it. Until then, Craft
  Atlas continues to render the suburb in place of region — same as today.

---

### 4. Fine Grounds Atlas (`fine_grounds`)

- **GitHub:** [`MattStirlingAustralianHeritage/fine-grounds-atlas`](https://github.com/MattStirlingAustralianHeritage/fine-grounds-atlas)
- **Vercel project:** `fine-grounds-atlas`
- **Canonical domain:** `https://finegroundsatlas.com.au` (200)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Fine Grounds Atlas/fine-grounds-atlas`
- **Entity tables:** `roasters` and `cafes` on Supabase project `szrpercdevafkamzyzef` (vertical has TWO entity tables — sync routes to one or the other based on category)
- **Region columns present:** `sub_region` on both tables
- **Detail render paths:**
  - `app/roasters/[slug]/page.js` — reads `roaster.sub_region`
  - `app/cafes/[slug]/page.js` — reads `cafe.sub_region`
- **Sync mapping** ([lib/sync/pushToVertical.js:362](lib/sync/pushToVertical.js:362)):
  - `sub_region: data.region` ← good
  - **No `suburb` column on either table** — only `sub_region` carries place context
- **Pre-existing `/api/revalidate`:** no
- **Stats:**
  - Roasters: 68 published, 0 overrides, **45 stale (95.7%)**
  - Cafes: 20 published, 0 overrides, **2 stale (66.7%)** (only 3 matched — most portal listings haven't been pushed to cafes yet)
- **Stale samples (roasters):**
  - `23-degrees-coffee-roasters`: portal "Melbourne" vs vertical `1 Belrose Ave` (full street address as region — operator-entered noise)
  - `pioneer-coffee-roastery`: portal "Sunshine Coast Hinterland" vs vertical `1-41 Pioneer Road, Yandina QLD`
- **Phase 2 readiness:** **READY**. Pattern works for both tables.

> Note: Fine Grounds is the only vertical with two entity tables. The
> `triggerVerticalRevalidation` helper in pushToVertical.js currently maps
> `fine_grounds` to a single path prefix `/roasters` — that's wrong for cafes.
> Phase 2 needs a small refactor: pass the table name (or category) into the
> revalidation call so cafes get `/cafes/<slug>` and roasters get
> `/roasters/<slug>`. Surfacing here so it's not a surprise during
> implementation.

---

### 5. Field Atlas (`field`)

- **GitHub:** [`MattStirlingAustralianHeritage/field-atlas`](https://github.com/MattStirlingAustralianHeritage/field-atlas)
- **Vercel project:** `field-atlas`
- **Canonical domain:** `https://fieldatlas.com.au` (200)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Field Atlas/field-atlas`
- **Entity table:** `places` on Supabase project `hdbcomxiswnagjzvimdi`
- **Region columns present:** `region` (note: NOT `sub_region`), `suburb`, `nearest_town`, `state`
- **Detail render path:** `app/places/[slug]/page.js`
  - Reads `place.region` for the breadcrumb/region link
  - Reads `place.nearest_town` for the hero card
- **Sync mapping** ([lib/sync/pushToVertical.js:390](lib/sync/pushToVertical.js:390)):
  - `region: data.region` ← good (Field uses `region`, not `sub_region`)
  - `suburb: data.suburb || data.region`
- **Pre-existing `/api/revalidate`:** no
- **Stats:** 212 published, 0 overrides, 139 computed, 82 legacy, 0 null, **104 stale (49.1%)**
- **Stale samples:**
  - `the-pinnacle-canberra`: portal "Canberra District" vs vertical `region: "Canberra"`
  - `cotter-bend-pool`: portal "Canberra District" vs vertical `region: "Canberra Region"`
- **Phase 2 readiness:** **READY**. Lower stale-rate than other verticals because
  `place.region` was being populated more carefully early on. The "Canberra" /
  "Canberra District" / "Canberra Region" naming inconsistency is real but
  separate from the propagation work.

---

### 6. Corner Atlas (`corner`) — **BLOCKED ON SCHEMA**

- **GitHub:** [`MattStirlingAustralianHeritage/corner-atlas`](https://github.com/MattStirlingAustralianHeritage/corner-atlas)
- **Vercel project:** `corner-atlas`
- **Canonical domain:** `https://corneratlas.com.au` (200)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Corner Atlas/corner-atlas`
- **Entity table:** `shops` on Supabase project `dxgtfjysyhyridgtgafz`
- **Region columns present:** **`suburb` and `city` only** — NO `sub_region`, NO `region`
- **Detail render path:** `app/shops/[slug]/page.js`
  - Reads `shop.suburb` for hero/breadcrumb/title/address
- **Sync mapping** ([lib/sync/pushToVertical.js:405](lib/sync/pushToVertical.js:405)):
  - `suburb: data.suburb || data.region` — same conflation pattern as Craft
- **Pre-existing `/api/revalidate`:** no
- **Stats:** 176 published, 0 overrides, 169 computed, 9 legacy, 1 null, **148 stale (84.1%)**
- **Phase 2 readiness:** **BLOCKED.** Same as Craft: needs a schema migration
  to add `sub_region` (or `region`) to `shops`.

---

### 7. Found Atlas (`found`) — **BLOCKED ON SCHEMA**

- **GitHub:** [`MattStirlingAustralianHeritage/found-atlas`](https://github.com/MattStirlingAustralianHeritage/found-atlas)
- **Vercel project:** `found-atlas`
- **Canonical domain:** `https://foundatlas.com.au` (200)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Found Atlas/found-atlas`
- **Entity table:** `shops` on Supabase project `vtsrksujbvovtgtfbapt`
- **Region columns present:** **`suburb` and `city` only** — NO `sub_region`, NO `region`
- **Detail render path:** `app/shops/[slug]/page.js`
  - Reads `shop.suburb` for hero/breadcrumb/title/address
- **Sync mapping** ([lib/sync/pushToVertical.js:421](lib/sync/pushToVertical.js:421)):
  - `suburb: data.suburb || data.region`
- **Pre-existing `/api/revalidate`:** no
- **Stats:** 168 published, 0 overrides, 169 computed, 5 legacy, 4 null, **146 stale (86.9%)**
- **Phase 2 readiness:** **BLOCKED.** Same as Craft and Corner: needs a schema
  migration to add `sub_region` (or `region`) to `shops`.

---

### 8. Table Atlas (`table`) — **BLOCKED ON SCHEMA**

- **GitHub:** [`MattStirlingAustralianHeritage/table-atlas`](https://github.com/MattStirlingAustralianHeritage/table-atlas)
- **Vercel project:** `table-atlas`
- **Canonical domain:** `https://tableatlas.com.au` (200)
- **Repo path:** `/Users/matt/Desktop/Australian Atlas Websites/Table Atlas/table-atlas`
- **Entity table:** `listings` on Supabase project `thplpgmorcohgjroizhh`
- **Region columns present:** **`suburb` and `city` only** — NO `sub_region`, NO `region`
- **Detail render path:** `app/listings/[slug]/page.js`
  - Reads `listing.suburb` for hero/breadcrumb/title/address
- **Sync mapping** ([lib/sync/pushToVertical.js:434](lib/sync/pushToVertical.js:434)):
  - `suburb: data.suburb || data.region`
- **Pre-existing `/api/revalidate`:** no
- **Stats:** 65 published, 0 overrides, 57 computed, 3 legacy, 0 null, **55 stale (93.2%)**
- **Phase 2 readiness:** **BLOCKED.** Same as Craft, Corner, Found: needs a
  schema migration to add `sub_region` (or `region`) to `listings`.

---

## Summary table

| Vertical | Table | Region col present | Render reads | Stale | Phase 2 |
|----------|-------|--------------------|--------------|-------|---------|
| sba | venues | `sub_region` | `sub_region` | 1445 / 2151 (67%) | **READY** |
| collection | venues | `sub_region` | `sub_region` | 604 / 962 (63%) | **READY** |
| craft | venues | — | `suburb` | 2202 / 2337 (94%) | **BLOCKED** (no region column) |
| fine_grounds (roasters) | roasters | `sub_region` | `sub_region` | 45 / 68 (96%) | **READY** |
| fine_grounds (cafes) | cafes | `sub_region` | `sub_region` | 2 / 3 (67%) | **READY** |
| field | places | `region` | `region` | 104 / 212 (49%) | **READY** |
| corner | shops | — | `suburb` | 148 / 176 (84%) | **BLOCKED** (no region column) |
| found | shops | — | `suburb` | 146 / 168 (87%) | **BLOCKED** (no region column) |
| table | listings | — | `suburb` | 55 / 65 (93%) | **BLOCKED** (no region column) |

## Implementation gotchas surfaced by the audit

1. **SBA/Collection share one Supabase venues table** but live in two separate
   Vercel projects with separate ISR caches. Both repos need the
   `/api/revalidate` route, both need `REVALIDATION_SECRET` set, and the portal
   sync needs to call **both** revalidate endpoints when a listing in this
   shared table changes (because the portal can't always tell at sync time
   whether a venue is being viewed under SBA or Collection — a brewery is SBA,
   a gallery is Collection, but the cache is per-vertical-domain). Phase 2
   should keep this in mind: the `triggerVerticalRevalidation` helper takes a
   single `vertical` arg today; this assumption holds for SBA + Collection
   because their type filters are disjoint, so a given listing only renders on
   one of the two domains.

2. **Fine Grounds has two entity tables** (roasters + cafes) with two distinct
   listing-path prefixes (`/roasters/<slug>` and `/cafes/<slug>`). The current
   `VERTICAL_LISTING_PATH_PREFIX` map in pushToVertical.js maps `fine_grounds`
   to a single string `/roasters`, which would mis-revalidate cafes. Phase 2
   needs to either branch on `data.category === 'cafe'` inside
   `triggerVerticalRevalidation` (matching the existing branching in
   `pushToVertical()` itself) or pass the resolved table/path in.

3. **Today's `VERTICAL_BASE_URLS` and `VERTICAL_LISTING_PATH_PREFIX` maps in
   `lib/sync/pushToVertical.js` are duplicated** of data already in
   `VERTICAL_CONFIG.baseUrl` / `.listingPath` in `lib/supabase/clients.js`.
   Phase 2 should consolidate to read from `VERTICAL_CONFIG` rather than the
   parallel constants — single source of truth, one less place to drift.
   (Pulled from `VERTICAL_CONFIG.baseUrl` and `VERTICAL_CONFIG.listingPath` for
   single-table verticals; from `VERTICAL_CONFIG.listingPaths` keyed by table
   name for Fine Grounds.)

4. **No second-listing override exists in production.** Phase 3 verification
   was supposed to confirm an override change propagates. Right now the only
   override is Mona Farm. Phase 3 will need to *create* a test override on a
   listing per vertical (set `region_override_id` on a chosen portal listing),
   re-sync, observe propagation, then revert. Or accept that the verification
   for Phase 3 is "the legacy → resolved-name flip propagates" rather than
   "override-change propagation," since the latter has no existing test data
   beyond Mona Farm.

5. **Status filter naming differs across verticals:**
   - SBA, Collection, Fine Grounds (both tables), Rest: `status = 'published'`
   - Craft, Field, Corner, Found, Table: `published = true` (boolean column)
     This doesn't affect the propagation pattern but is worth noting if Phase 2
     wants to do anything cross-vertical.

## Phase 4 backfill recommendation (deferred)

The above only fixes new syncs. To clean up existing stale rows, a backfill
would re-run `syncListingToVertical()` for every published listing per vertical.
Volume estimates:

| Vertical | Listings to re-sync (≈ stale count) |
|----------|-------------------------------------|
| sba | 1445 |
| collection | 604 |
| craft | 2202 (or 0 until schema added) |
| fine_grounds_roasters | 45 |
| fine_grounds_cafes | 2 |
| field | 104 |
| corner | 148 (or 0 until schema added) |
| found | 146 (or 0 until schema added) |
| table | 55 (or 0 until schema added) |
| **Total (ready)** | **2200** |
| **Total (after schemas added)** | **4751** |

Recommendation: a single backfill script that:
1. Iterates over every published portal listing per vertical
2. Calls `syncListingToVertical(id, vertical)` for each
3. The existing `recordSyncAndRevalidate` will log the resolution + fire
   revalidation; revalidations may rate-limit on Vercel for high-volume
   sequential calls — script should sleep ~200ms between iterations
4. Skip listings whose existing vertical region already equals the
   portal-resolved name (idempotency / cost saver)

Defer until editor decision. Recommended timing: after Phase 3 verification
confirms the going-forward fix is solid for at least 24 hours.

## Out-of-scope follow-ups noticed during the audit

- Field Atlas's region naming is inconsistent between the portal regions table
  ("Canberra District") and Field's stored region ("Canberra" / "Canberra
  Region" / "Canberra"). This is editorial drift, not propagation breakage.
  Worth a separate pass to canonicalise Field's region naming once the
  propagation chain is in place — that pass would show its work via `sync_log`.
- Fine Grounds roasters and cafes have address strings in `sub_region`
  (e.g. `1 Belrose Ave`, `1-41 Pioneer Road, Yandina QLD`). This is data
  pollution from an earlier sync (or operator entry). The propagation fix will
  overwrite these on next sync, but the current values are themselves wrong —
  not just stale.
- Craft Atlas has 1336 portal listings whose `source_id` doesn't match any row
  on the vertical (per the first audit run). After paginating the audit
  correctly, this dropped to 1 — so it was a query artifact, not a real
  orphaning issue.
