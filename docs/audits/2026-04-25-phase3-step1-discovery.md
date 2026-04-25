# Phase 3 Step 1 — Read-site Discovery for `listings.region`

> **Batch 5 status (2026-04-25, very-very late):** ✅ landed.
>
> Editorial / agent pipelines migrated to FK-based region access via `getListingRegion`. Eleven files touched. `lib/sync/syncEmbeddings.js` was **NOT** modified (explicit out-of-scope per task spec — separate controlled run).
>
> **Migrated:**
> - [app/api/cron/enrichment-agent/route.js](australian-atlas/app/api/cron/enrichment-agent/route.js) — select extended with `LISTING_REGION_SELECT`; prompt-context display read switched to helper.
> - [app/api/cron/listing-velocity-agent/route.js](australian-atlas/app/api/cron/listing-velocity-agent/route.js) — select extended; per-listing aggregation key now uses `getListingRegion(l)?.name`. Snapshot reads from `listing_history` table left untouched (historical data, not live listings).
> - [app/api/cron/revenue-signal-agent/route.js](australian-atlas/app/api/cron/revenue-signal-agent/route.js) — select extended; email-display read migrated.
> - [app/api/cron/user-reactivation-agent/route.js](australian-atlas/app/api/cron/user-reactivation-agent/route.js) — three selects extended; prompt-construction and email-display reads migrated.
> - [app/api/cron/backlink-builder-agent/route.js](australian-atlas/app/api/cron/backlink-builder-agent/route.js) — two selects extended; substring-match against article body now uses canonical region name from helper.
> - [app/api/cron/seo-content-agent/route.js](australian-atlas/app/api/cron/seo-content-agent/route.js) — select extended; result-mapping `region` field switched to helper. The fuzzy multi-field `.or('region.ilike.%X%,state.ilike.%X%,suburb.ilike.%X%')` location lookup at line 157 left in place per halt threshold (multi-field ilike against natural-language input — explicit decision required).
> - [app/api/cron/editorial-signals-agent/route.js](australian-atlas/app/api/cron/editorial-signals-agent/route.js) — select extended; display read migrated. The slug-emit at line 473 was already correct (uses `regions` table data).
> - [lib/agents/operator-amplification-agent.js](australian-atlas/lib/agents/operator-amplification-agent.js) — select extended; both Claude-prompt context and email-display reads migrated. Used relative import `../regions/index.js` to match existing lib-internal patterns.
> - [scripts/generate-region-editorial.mjs](australian-atlas/scripts/generate-region-editorial.mjs) — refactored `getRegionContext` to take full region row instead of just `regionName`; query swapped from joining-via-text to FK match (`region_computed_id OR region_override_id`).
> - [scripts/generate-region-narratives.mjs](australian-atlas/scripts/generate-region-narratives.mjs) — `getRegionListings` now uses FK match as primary path. Old bbox lat/lng + zoomToRadiusDeg approach replaced. Text-fallback `.or('region.ilike.%name%,address.ilike.%name%')` retained as a secondary path for unactivated regions (no polygon → no FK match — currently only triggers for draft regions).
> - [scripts/generate-editorial-brief.mjs](australian-atlas/scripts/generate-editorial-brief.mjs) — selects extended; prompt-context console.log and Claude-prompt location string both migrated. The fuzzy ilike at line 81 (`.ilike('region', '%${listing.region || listing.state}%')` for nearby-listings context) left in place per halt threshold (single-field ilike with `||` value-fallback to state — semantics subtle, deferred for explicit decision).
>
> **Skipped per halt thresholds (with reasons):**
> - `app/api/cron/seo-content-agent/route.js:157` — multi-field fuzzy `.or(region.ilike%X%,state.ilike%X%,suburb.ilike%X%)` against unknown user-text input. Migration would need explicit semantic decision about how to interpret cross-field location queries.
> - `scripts/generate-region-narratives.mjs:110` — text fallback for unactivated regions (no polygon means no FK match possible). Intentional residual to keep the script working for draft regions.
> - `scripts/generate-editorial-brief.mjs:81` — single-field `region.ilike` with state-fallback semantics. Conservative skip; the migrated FK approach would need to decide between strict-empty (Decision 1) and state-fallback for null-region listings.
>
> **Out of scope (confirmed not modified):**
> - `lib/sync/syncEmbeddings.js` — explicit out-of-scope per task spec. Will be migrated as a separate controlled run.
>
> Build compiles clean. Code's verification: complete.
>
> **Pending for follow-up batches:**
> - Batch 6: admin UI
> - Batch 7: `updateRegionCounts.js` ilike+alias replacement
> - Future: `lib/sync/syncEmbeddings.js` (separate controlled run)
>
> **Matt's verification: pending.** These are non-browser surfaces (cron routes / scripts / agent libs) so verification means kicking off the relevant pipelines and inspecting outputs. Suggested checks:
> - Run `node --env-file=.env.local scripts/generate-region-narratives.mjs --slug=hunter-valley --dry-run` — confirm listing count and vertical breakdown look right (FK match rather than bbox/text).
> - Run `node --env-file=.env.local scripts/generate-region-editorial.mjs --slug=barossa-valley --dry-run` — same.
> - Run `node --env-file=.env.local scripts/generate-editorial-brief.mjs --name="Turkey Flat Vineyards"` — confirm "Region:" line shows canonical name and prompt context location string is correct.
> - Trigger one cron pipeline (enrichment-agent or revenue-signal-agent) for a single test listing and verify generated content references the canonical region name (not stale text).
> - For quarantine-pool listings (NULL region FK): pipelines should still run, but region context will be empty/null rather than stale text.

---

> **Batch 4 status (2026-04-25, very late):** ✅ landed.
>
> Cross-listing recommendations migrated to FK matching with override-wins precedence per Decision 3, strict-empty for NULL regions per Decision 1.
>
> **Migrated:**
> - [app/place/[slug]/page.js:226-258](australian-atlas/app/place/[slug]/page.js#L226) — `getRegionListings` and `getCrossVerticalListings`. Both swapped from `.eq('region', listing.region)` text matching to `.or('region_computed_id.eq.${region.id},region_override_id.eq.${region.id}')` FK matching. Both functions now derive the effective region via `getListingRegion(listing)` at the top and return `[]` early when null (the 917 quarantine listings get no cross-region recs per Decision 1).
>
> **No-migration-needed (filters not region-based):**
> - `app/place/[slug]/page.js:getClusterSiblings` — uses `cluster_id`, not region. Unchanged.
> - `components/NearbySection.js` — fetches `/api/nearby` (lat/lng geo-based, no region filter).
> - `components/CrossVerticalNearby.js`, `WhatsNearby.js`, `WhatsNearbyStandalone.js` — same `/api/nearby` consumers.
> - `components/SameSpirit.js` — fetches `/api/similar` (embedding-based, region incidental).
> - `app/api/similar/route.js` — pgvector + suburb/vertical exclusion. No region filter; per task spec ("if /api/similar uses a different similarity model and region is incidental or absent, no migration needed"). The result shape includes `region: s.region` legacy text passthrough from the RPC; not migrated because the source RPC `match_similar_listings` is a stored function out of step-1 scope.
> - `app/api/nearby/route.js` — already has `LISTING_REGION_SELECT` from Batch 2-finish; no region filter to migrate.
>
> Build compiles clean. Code's verification: complete.
>
> **Pending for follow-up batches:**
> - Batch 5: editorial / agents
> - Batch 6: admin UI
> - Batch 7: `updateRegionCounts.js` ilike+alias replacement
>
> **Matt's verification: pending.** Browser-side checks:
> - Place page `/place/[slug]` for an activated-region listing (e.g. Hunter Valley): "More in this region" surfaces other Hunter Valley listings via FK match.
> - Place page for a quarantine listing (NULL `region_computed_id`): both rec sections empty / hidden gracefully (per Decision 1 strict-empty).
> - Cross-vertical recs surface other verticals (small-batch listing in Hunter shows craft + rest etc.)
> - The `getClusterSiblings` cluster-aware recs still surface (independent of region).
> - `/api/nearby` consumers (NearbySection, WhatsNearby, etc.) — unchanged behaviour expected.

---

> **Batch 3 status (2026-04-25, late evening):** ✅ landed.
>
> Filter migration to FK + URL parameter dual-acceptance per Decision 2 + 3.
>
> **New helper: `lib/regions/resolveRegionParam.js`** (added to barrel exports). Accepts slug-shaped or name-shaped input, looks up live regions row, returns `{ region, canonicalParam, redirectNeeded }` for callers to drive 301 canonicalisation.
>
> **Filter sites migrated to FK matching:**
> - [app/api/search/route.js:337,352](australian-atlas/app/api/search/route.js#L337) — explicit `?region=` URL param now resolves via helper, filters via `region_computed_id OR region_override_id`. Falls back to legacy text `eq('region', ...)` when the param doesn't resolve to any live region (preserves search functionality for unactivated regions like Riverina).
> - [app/api/v1/venues/route.js](australian-atlas/app/api/v1/venues/route.js) — public API, dual-acceptance with `X-Deprecated-Param` header signal when name-shape used. No 301 redirect (would break programmatic clients per task spec).
> - [app/api/v1/regions/[slug]/venues/route.js:54](australian-atlas/app/api/v1/regions/[slug]/venues/route.js#L54) — replaced `.ilike('region', %name%)` with FK match against the resolved region's id.
> - [app/regions/[slug]/page.js:108-127](australian-atlas/app/regions/[slug]/page.js#L108) — `getRegionListings` now uses pure FK match. Removed the legacy ilike+address fuzzy fallback (which existed to handle alias mismatches that don't apply once FK semantics are authoritative).
> - [app/page.js:204](australian-atlas/app/page.js#L204) — homepage `getDiscoverClusters` resolves each cluster name via helper, filters via FK with legacy text `eq` fallback for unresolvable names. Renamed "Byron Hinterland" → "Byron Bay" in the cluster list (matching the homepage card cleanup from Batch 1).
>
> **Sites NOT migrated** (per halt thresholds):
> - `api/search/route.js` hint-region ilike at lines 374-376, 421, 463 — fuzzy matching against region OR state text from natural-language query parsing. Per task halt threshold: ".ilike() doing fuzzy matching that's not just 'this region exactly' — fuzzy semantics need explicit decision." Skipped; flagged for future cleanup.
> - `api/search/route.js` cleanedTerms loop ilike at 386, 429 — full-text search across name/description/region/state/address. Same halt-threshold reason. The `region.ilike` portion stays text-based; will be cleaned up alongside the column drop.
> - `app/admin/staleness/page.js` — admin filter, deferred to Batch 6.
> - `app/api/admin/listings/route.js` — admin filter, deferred to Batch 6.
> - `components/RelatedContent.js` — cross-listing filter, deferred to Batch 4.
>
> **No-op surfaces** (the URL emitter exists but no consumer behavior to migrate):
> - `/map` — page reads `searchParams.region` is mentioned in URL emitters from `/regions/[slug]/page.js:620` but the MapClient consumer never reads it. No filter behavior exists to canonicalise. Adding region support is a feature, not a migration. Documented for follow-up.
> - `/trails/builder` — same situation. URL emitter exists at `/seo/[slug]/page.js:346`, builder ignores. No filter to migrate. Documented for follow-up.
> - `/api/council/data` — already slug-based via separate `region_slug` column with allowlist validation. No legacy text matching to migrate.
>
> **Dual-acceptance route summary:**
> - `/api/search` ← internal resolution, no redirect (URL canonicalisation deferred to client-side router.replace pattern, future iteration)
> - `/api/v1/venues` ← internal resolution + `X-Deprecated-Param` header
> - `/api/v1/regions/[slug]/venues` ← slug-only by design (path param)
> - `/regions/[slug]` ← FK match against resolved region row, slug-only by design
> - Homepage clusters ← internal hardcoded resolution
>
> Build compiles clean. Code's verification: complete.
>
> **Pending for follow-up batches:**
> - Batch 4: cross-listing recommendations
> - Batch 5: editorial / agents
> - Batch 6: admin UI (incl. admin search/staleness filter sites)
> - Batch 7: `updateRegionCounts.js` ilike+alias replacement
> - Future cleanup: search route's hint-region fuzzy ilike + cleanedTerms region.ilike (currently text-based; could migrate to JOIN-based fuzzy match if/when listings.region column is dropped, but Decision 5 leaves the column dormant indefinitely so no urgency)
>
> **Matt's verification: pending.** Browser-side checks for the dual-acceptance behavior:
> - `/search?region=hunter-valley` returns Hunter Valley listings
> - `/search?region=Hunter%20Valley` (name-form) — internal resolution: same listings returned. Page-level URL canonicalisation deferred (no client redirect implemented; user sees the URL they typed).
> - `/search?region=nonsense` — falls back to legacy text eq, returns whatever has that exact text (likely nothing); doesn't crash.
> - `/api/v1/venues?region=hunter-valley` and `?region=Hunter%20Valley` both return same data, name-shape includes `X-Deprecated-Param` header.
> - `/api/v1/regions/hunter-valley/venues` returns FK-matched listings (no longer ilike text fuzzy).
> - Region detail page `/regions/hunter-valley` shows same listings as before (FK match should produce same set as previous text match for activated regions).
> - Homepage Byron Bay cluster card now resolves to actual byron-bay listings (vs the previously-broken "Byron Hinterland" name).

---

> **Batch 2-finish status (2026-04-25, evening):** ✅ landed.
>
> Migrated remaining display-side surfaces to use the helper. 17 additional files now reference `getListingRegion` or `LISTING_REGION_SELECT`:
> - **Components:** `NearbySection.js`, `StartTrailButton.js`, `PlanChat.js` (display reads switched to helper)
> - **User-facing pages:** `dashboard/page.js`, `dashboard/listings/page.js`, `profile/page.js`, `network/page.js`, `operators/share/[token]/page.js`
> - **API routes (data-shape — selects + result-object construction):** `api/autocomplete/route.js`, `api/user/saves/route.js`, `api/user/visits/route.js`, `api/operators/share/[token]/route.js`, `api/operators/export/pdf/route.js`, `api/dashboard/editorial/route.js`, `api/trails/search/route.js`
> - **Major routes:** `api/itinerary/route.js` (LISTING_COLS shared select extended; anchor query, anchorData query, all `region: X.region` data-shape passes including `v.region`, `rv.region`, `candidate.region`, `bestRest.region`, `anchorData.region` migrated to canonical via helper), `api/on-this-road/route.js` (data-shape only — SELECT_COLS extended, all `region: X.region` data-shape passes migrated, **filter logic explicitly preserved for Batch 3 per task**)
>
> Special-case handling:
> - Trail-stops display in `app/trails/builder/page.js` (lines 708-712, 805-809) was **deliberately not migrated** — those reads are from the `trail_stops` denormalised table which doesn't have FK relations to `regions`. Migration of trail_stops is Phase 3 step 2 territory.
> - `nr.region` and `mapping.region` references in `api/itinerary/route.js` were left alone — they're region-table data and CITY_TO_REGION constants, not listing.region reads.
> - The IIFE pattern `{(() => { const r = getListingRegion(x); return r && <...> })()}` was used in JSX where the existing `{x.region && <...>}` guard couldn't be cleanly replaced inline. Slightly ugly but correct.
>
> 35 files now total reference the helper or select fragment (18 from Batch 1 + 17 from this batch). Build compiles clean.
>
> **Pending for follow-up batches:**
> - Batch 3 (filter sites + URL contract): largely unchanged from prior reccy. Largest single file: `api/search/route.js`.
> - Batch 4 (cross-listing recs): place-page rec functions + 4 components.
> - Batch 5 (editorial/agents): cron routes + embeddings.
> - Batch 6 (admin UI): bulk mechanical migration.
> - Batch 7 (`updateRegionCounts.js`): single file core, count semantics shift.
>
> **Code's verification: complete.** `npm run build` succeeds. No compile errors. No residual `listing.region` text reads in the migrated files (confirmed by grep against the touched set).
>
> **Matt's verification: pending.** Browser-side checks for itinerary, on-this-road, trails-builder, dashboard, profile, network, operators-share user flows. Helper-driven NULL handling means quarantine-pool listings will display empty in the relevant surfaces.

---

> **Batch 1 status (2026-04-25, late):** ✅ landed.
>
> Helper `lib/regions/getListingRegion.js` (with `getListingRegion`, `getListingRegionDetail`, `LISTING_REGION_SELECT`) and barrel `lib/regions/index.js` created. Migration applied to the universal display surfaces and major user-facing routes:
> - `components/ListingCard.js`, `lib/jsonLd.js` (universal)
> - `app/place/[slug]/page.js` (5 selects + breadcrumb + hero, simplified the cleanRegion + ad-hoc regions-table-lookup down to a single helper call)
> - `app/page.js` (homepage region cards: explicit slugs replacing brittle name-slugification; fixed broken `byron-hinterland` slug → `byron-bay`)
> - `app/regions/[slug]/page.js`, `app/seo/[slug]/page.js`, `app/og/[slug]/route.js`
> - `app/for-you/page.js` + `ForYouClient.js`, `app/near-me/NearMeClient.js` + `api/nearby/route.js`
> - `app/claim/page.js` + `claim/[slug]/page.js` (passes canonical to `ClaimSearch.js` via existing `region` prop)
> - `app/collections/[slug]/page.js`, `app/api/search/route.js` (data-shape only — filter logic remains for Batch 3), `app/api/dashboard/route.js`
>
> 18 files now reference the helper or `LISTING_REGION_SELECT`. Build compiles clean. No `listing.region` text reads remain in `ListingCard` or `jsonLd`.
>
> **Pending for follow-up batches** (out of Batch 1 scope per task):
> - Filter logic in `app/api/search/route.js` ilike + URL param handling → Batch 3
> - Cross-listing rec functions in `app/place/[slug]/page.js` (getRegionListings, getCrossVerticalListings, getClusterSiblings) — selects updated, filters left for Batch 4
> - `lib/sync/updateRegionCounts.js` ilike+alias logic → Batch 7
> - `app/admin/*`, `app/api/cron/*`, `lib/sync/*` → Batches 5, 6, 7 / Phase 3 step 2
> - Vendor dashboard display (`app/dashboard/page.js`, `app/dashboard/listings/page.js`) — API selects updated; in-component display reads still on `listing.region` text. Low risk; vendor-only surface.
> - Several remaining `app/api/*` routes that select region but don't pass listings through ListingCard — left untouched in this batch (data-shape parity not required for non-display consumers).
>
> **Code's verification: complete.** `npm run build` succeeds; no compile errors. All 18 helper-using files import correctly. No `listing.region` residual references in the migrated files.
>
> **Matt's verification: pending.** Browser-side checks (region pages render, place breadcrumb shows canonical names, homepage cards link to correct slugs, search results render with region) require a manual user-flow review.

---

## Post-Batch-1 scope clarification (2026-04-25, late evening)

**Phase 3 step 1 progress:** Roughly **35% of the original 7-batch scope landed in Batch 1**, primarily the universal display surfaces (ListingCard, jsonLd) and the highest-traffic user-facing routes. The remaining 65% is split fairly evenly across: leftover display sites (~15%), filter sites and URL contract (~15%), cross-listing recs (~10%), editorial/agent pipelines (~10%), admin UI (~10%), and updateRegionCounts cleanup (~5%).

**Recommended next batch: Batch 2-finish — leftover user-facing display sites.** Mostly mechanical, no new decisions, low risk. Then Batch 3 (filters + URL contract), which has the most unresolved design work because of Decision 2 dual-acceptance.

### Batch 2 — Display sites (LEFTOVER)

**Original scope:** ListingCard, jsonLd, place page display.

**Landed in Batch 1:** All universal surfaces (ListingCard, jsonLd, place page hero/breadcrumb), plus user-facing routes: place, regions, seo, og, for-you, near-me, claim, collections.

**Remaining (Batch 2-finish):** display sites that still emit `listing.region` text inline. ~15 files. Mechanical migration (add `LISTING_REGION_SELECT` to select, replace `listing.region` access with `getListingRegion(listing)?.name`).

| File | Lines | Work |
|---|---|---|
| [components/NearbySection.js:273](australian-atlas/components/NearbySection.js#L273) | 273, 278 | Display read in card markup |
| [components/StartTrailButton.js:137,236](australian-atlas/components/StartTrailButton.js#L137) | 137, 235-236 | Display + the line-137 fallback string used in trail name suggestion |
| [components/SearchAutocomplete.js](australian-atlas/components/SearchAutocomplete.js) | grep showed match | Spot-check needed |
| [app/dashboard/page.js:287](australian-atlas/app/dashboard/page.js#L287) | 287 | Vendor dashboard inline display read (API select already updated in Batch 1) |
| [app/dashboard/listings/page.js:104,111](australian-atlas/app/dashboard/listings/page.js#L104) | 104, 111 | Vendor listings detail page |
| [app/api/itinerary/route.js](australian-atlas/app/api/itinerary/route.js) | many (87, 104, 1198+ refs) | Itinerary builder pulls region into data shapes returned to the UI. Substantial — the route builds a complex result object with embedded region strings. Display-shape, not filter-shape. |
| [app/api/trails/search/route.js](australian-atlas/app/api/trails/search/route.js) | grep matches | Trail-builder venue search; passes region in result shape |
| [app/api/operators/export/pdf/route.js](australian-atlas/app/api/operators/export/pdf/route.js) | grep matches | PDF export — region in the printed output |
| [app/api/dashboard/editorial/route.js](australian-atlas/app/api/dashboard/editorial/route.js) | grep matches | Vendor editorial dashboard data |
| [app/api/on-this-road/route.js](australian-atlas/app/api/on-this-road/route.js) | grep matches | Road-trip planner — display + filter; the display portion in scope here |
| [app/api/autocomplete/route.js](australian-atlas/app/api/autocomplete/route.js) | grep matches | Search autocomplete suggestions — region in suggestion text |
| [app/profile/page.js](australian-atlas/app/profile/page.js) | grep match | User profile — possibly saved listings preview |
| [app/operators/share/[token]/page.js](australian-atlas/app/operators/share/[token]/page.js) | grep match | Operator share page |
| [app/network/page.js](australian-atlas/app/network/page.js) | grep match | Network overview page |
| [app/trails/builder/page.js](australian-atlas/app/trails/builder/page.js) | grep match | Trail builder |
| [app/plan/PlanChat.js](australian-atlas/app/plan/PlanChat.js) | grep match | Plan-my-stay chat UI — region in suggestion display |

**Estimated size: small-to-medium.** ~15 files, mostly 1-3 lines each. The two non-trivial cases are `api/itinerary/route.js` (large file, region threaded through many response-shape objects) and `api/on-this-road/route.js` (mixed display + filter).

**Risk: low.** All purely mechanical with the helper. The itinerary route is the only one large enough to warrant care; rest are templates of the place-page pattern.

### Batch 3 — Filter sites + URL parameter dual-acceptance

**Original scope:** `.eq('region', ...)` and `.ilike('region', ...)` filters, plus public URL `?region=` parameter handling per Decision 2 (accept both slug and name during migration window).

**Landed in Batch 1:** Nothing — explicitly preserved. Data-shape was added to `/api/search` but filter logic untouched.

**Remaining (Batch 3):**

| File | Filter type | Work |
|---|---|---|
| [app/api/search/route.js](australian-atlas/app/api/search/route.js) | URL param + 6 sites of `.eq('region', region)` and `.ilike('region', %hint%)` plus OR clauses | **Largest single file in this batch.** Dual-acceptance: accept slug or name, look up regions row, switch to FK filter. Plus search ranking uses ilike across multiple fields — that combination needs a thoughtful rewrite. |
| [app/api/admin/listings/route.js:36,56,76](australian-atlas/app/api/admin/listings/route.js#L36) | URL param + 2 `.eq` filters | Admin filter — internal users; lower risk |
| [app/api/v1/venues/route.js:46,58](australian-atlas/app/api/v1/venues/route.js#L46) | URL param + `.ilike` | **External public API.** External integrators may have URLs pinned. Dual-acceptance is exactly the case for this. |
| [app/api/v1/regions/[slug]/venues/route.js:54](australian-atlas/app/api/v1/regions/[slug]/venues/route.js#L54) | `.ilike` against region.name | Public API — uses regions row's name as filter; switch to FK. |
| [app/api/council/data/route.js:95](australian-atlas/app/api/council/data/route.js#L95) | URL param | Council partner data export. Param is already slug-based per the sitemap audit; just needs FK filter rather than text. |
| [app/regions/[slug]/page.js:108,119](australian-atlas/app/regions/[slug]/page.js#L108) | `.eq` + `.or(ilike+address)` fallback | Region detail page — currently text-matches by `regions.name`, with ilike fallback for alias mismatches. After Batch 3, this becomes a clean `.eq('region_computed_id', region.id).or('region_override_id.eq.region.id')`. The fallback alias logic in `lib/sync/updateRegionCounts.js` becomes vestigial. |
| [app/page.js:213](australian-atlas/app/page.js#L213) | `.eq('region', region)` in homepage cluster fetch | Homepage 6-cluster fetch — currently text-matches, hard-coded names. After Batch 3, switch to FK lookup. |
| [app/admin/staleness/page.js:101](australian-atlas/app/admin/staleness/page.js#L101) | `.ilike` filter | Admin filter |
| [app/search/page.js:220](australian-atlas/app/search/page.js#L220) | `searchParams.get('region')` URL param read | Search form pre-fill from URL — needs slug-aware handling for dual-acceptance |
| [components/RelatedContent.js:30](australian-atlas/components/RelatedContent.js#L30) | `.ilike` | Related content fuzzy filter — used by collections detail page |
| Add dual-acceptance to `/map` and `/trails/builder` routes | URL param | Per the sitemap audit recommendation — these are referenced by name-shaped URLs from regions page and SEO page |

**Estimated size: large.** ~10-12 files, but `api/search/route.js` alone is dense and needs careful rewrite. The URL-param dual-acceptance pattern is shared logic that should probably extract to `lib/regions/resolveRegionParam.js` or similar.

**Risk: medium-to-high.** `api/search/route.js` filter logic affects ranked results — behaviour can subtly shift. Public API routes (`v1/*`) have external contract concerns. URL-param handling must accept legacy name-shaped URLs without breaking SEO-indexed links.

### Batch 4 — Cross-listing recommendations

**Original scope:** "More like this" / "Same region" recommendations on place page.

**Landed in Batch 1:** Selects in the three place-page rec functions had `LISTING_REGION_SELECT` added (so the cards render correctly via ListingCard), but the filter logic (`.eq('region', listing.region)`) was preserved.

**Remaining (Batch 4):**

| File | Work |
|---|---|
| [app/place/[slug]/page.js:225-256](australian-atlas/app/place/[slug]/page.js#L225) | `getRegionListings()`, `getCrossVerticalListings()` — switch from `.eq('region', listing.region)` text match to `.eq('region_computed_id', listing.region_computed_id)` (or COALESCE with override). Plus the guards `if (!listing.region)` become `if (!getListingRegion(listing))`. |
| [app/place/[slug]/page.js:263-278](australian-atlas/app/place/[slug]/page.js#L263) | `getClusterSiblings()` — uses `cluster_id`, not region; small region-related cleanup only |
| [components/NearbySection.js](australian-atlas/components/NearbySection.js) | Cross-listing rec component — filter via region + display |
| [components/CrossVerticalNearby.js](australian-atlas/components/CrossVerticalNearby.js) | Same pattern |
| [components/WhatsNearby.js](australian-atlas/components/WhatsNearby.js) | Same pattern |
| [components/WhatsNearbyStandalone.js](australian-atlas/components/WhatsNearbyStandalone.js) | Same pattern |
| [components/SameSpirit.js](australian-atlas/components/SameSpirit.js) | "Same spirit" cross-recs |
| [app/api/similar/route.js](australian-atlas/app/api/similar/route.js) | "Similar listings" API endpoint |

**Estimated size: medium.** ~7 files. All similar shape. Once the place-page rec functions are migrated, the components follow a template.

**Risk: low-to-medium.** NULL handling for the 917 quarantine listings: under text-match, they can still recommend each other if they happen to share text region (rare but possible); under FK filter, they'll get zero recs (because both have NULL FK). Acceptable per Decision 1 strict-empty.

### Batch 5 — Editorial / agent pipelines

**Original scope:** Cron routes for the 15 autonomous agents, embedding regeneration, editorial generation pipelines.

**Landed in Batch 1:** None — explicitly out of scope.

**Remaining (Batch 5):**

| File | Type | Work |
|---|---|---|
| [app/api/cron/enrichment-agent/route.js](australian-atlas/app/api/cron/enrichment-agent/route.js) | Cron | Enrichment agent — reads region for context |
| [app/api/cron/listing-velocity-agent/route.js](australian-atlas/app/api/cron/listing-velocity-agent/route.js) | Cron | Same pattern |
| [app/api/cron/revenue-signal-agent/route.js](australian-atlas/app/api/cron/revenue-signal-agent/route.js) | Cron | Same |
| [app/api/cron/user-reactivation-agent/route.js](australian-atlas/app/api/cron/user-reactivation-agent/route.js) | Cron | Same |
| [app/api/cron/backlink-builder-agent/route.js](australian-atlas/app/api/cron/backlink-builder-agent/route.js) | Cron | Same |
| [app/api/cron/seo-content-agent/route.js](australian-atlas/app/api/cron/seo-content-agent/route.js) | Cron | Reads region for SEO content generation |
| [app/api/cron/editorial-signals-agent/route.js](australian-atlas/app/api/cron/editorial-signals-agent/route.js) | Cron | Reads region; emits region-slug links in email (already correct) |
| [lib/agents/operator-amplification-agent.js](australian-atlas/lib/agents/operator-amplification-agent.js) | Agent lib | Operator amplification — reads region for messaging context |
| [lib/sync/syncEmbeddings.js:28](australian-atlas/lib/sync/syncEmbeddings.js#L28) | Embedding | **Special case.** Region text included in embedding input. Switching from `listing.region` text to canonical `regions.name` would change embeddings — requires regenerating all 6,510 embeddings. Plan as a controlled batch run, not on every push. |
| [scripts/generate-editorial-brief.mjs:79](australian-atlas/scripts/generate-editorial-brief.mjs#L79) | Script | Editorial brief generator |
| [scripts/generate-region-editorial.mjs:67](australian-atlas/scripts/generate-region-editorial.mjs#L67) | Script | Region editorial generator |

**Estimated size: medium.** ~10-12 files. Migration straightforward (switch read shape) — the side-effect concerns are real:
- Embedding regeneration cost (~6,500 listings × Voyage AI calls)
- Some agents may make decisions based on region text presence/absence; switching to FK changes NULL semantics

**Risk: medium.** Embedding regen is the load-bearing concern. Could be deferred to a separate sub-task even within Batch 5.

### Batch 6 — Admin UI

**Original scope:** Admin dashboard, region edit/override surfaces, internal tools.

**Landed in Batch 1:** None.

**Remaining (Batch 6):** ~20 admin pages + ~8 admin API routes. All read-shape mechanical migration with one notable surface — the override-vs-computed admin UI.

| Surface | Files | Work |
|---|---|---|
| Admin listings tables/filters | [app/admin/listings/page.js](australian-atlas/app/admin/listings/page.js), [admin/listings-review/ListingsReview.js](australian-atlas/app/admin/listings-review/ListingsReview.js), [admin/audit-review/page.js](australian-atlas/app/admin/audit-review/page.js), [admin/audit-review/AuditFilters.js](australian-atlas/app/admin/audit-review/AuditFilters.js), [admin/staleness/StalenessTable.js](australian-atlas/app/admin/staleness/StalenessTable.js), [admin/duplicates/DuplicatesTable.js](australian-atlas/app/admin/duplicates/DuplicatesTable.js), [admin/quality-report/page.js](australian-atlas/app/admin/quality-report/page.js), [admin/health/page.js](australian-atlas/app/admin/health/page.js), [admin/completeness/page.js](australian-atlas/app/admin/completeness/page.js) | Display + filter; mechanical |
| Editorial / candidate review | [admin/candidates/CandidateReviewQueue.js](australian-atlas/app/admin/candidates/CandidateReviewQueue.js), [admin/dead-images/page.js](australian-atlas/app/admin/dead-images/page.js), [admin/enrichment-audit/page.js](australian-atlas/app/admin/enrichment-audit/page.js), [admin/enrichment-review/page.js](australian-atlas/app/admin/enrichment-review/page.js), [admin/editorial/pitch/[id]/PitchBrief.js](australian-atlas/app/admin/editorial/pitch/[id]/PitchBrief.js), [admin/outreach/OutreachActions.js](australian-atlas/app/admin/outreach/OutreachActions.js), [admin/trails/page.js](australian-atlas/app/admin/trails/page.js), [admin/revenue/page.js](australian-atlas/app/admin/revenue/page.js) | Display reads |
| Listing edit (write surface) | [admin/listings/ListingEditor.js](australian-atlas/app/admin/listings/ListingEditor.js), [components/InlineListingEditor.js](australian-atlas/components/InlineListingEditor.js), [lib/admin/updateListing.js](australian-atlas/lib/admin/updateListing.js) | **Phase 3 step 2 territory.** Region write field needs to be replaced with override-id picker. Out of step 1 scope. |
| Admin API routes | [api/admin/listings/route.js](australian-atlas/app/api/admin/listings/route.js), [api/admin/editorial-pitches/route.js](australian-atlas/app/api/admin/editorial-pitches/route.js), [api/admin/editorial-pitches/brief/route.js](australian-atlas/app/api/admin/editorial-pitches/brief/route.js), [api/admin/quality-backfill/route.js](australian-atlas/app/api/admin/quality-backfill/route.js), [api/admin/backfill-verticals/route.js](australian-atlas/app/api/admin/backfill-verticals/route.js), [api/admin/resync-verticals/route.js](australian-atlas/app/api/admin/resync-verticals/route.js), [api/admin/candidates/cross-check/route.js](australian-atlas/app/api/admin/candidates/cross-check/route.js), [api/admin/listing-visibility/route.js](australian-atlas/app/api/admin/listing-visibility/route.js), [api/admin/audit-review/route.js](australian-atlas/app/api/admin/audit-review/route.js) | Most are write/admin operations; reads are minor. |

**New surface needed:** the override-vs-computed admin UI. When viewing a listing in admin, staff should see:
- Computed region (from trigger)
- Override region (currently null for most)
- An action to set/clear override

This is a step 1 read enhancement (using `getListingRegionDetail()` to surface provenance) plus a step 2 write surface.

**Estimated size: large.** Most admin files; bulk mechanical migration. Plus the new override-picker UI is a small but novel addition.

**Risk: low.** Internal users tolerate transition; rollback is per-file.

### Batch 7 — `updateRegionCounts.js` and miscellaneous

**Original scope:** Replace the ilike+alias logic with FK-based count.

**Landed in Batch 1:** None.

**Remaining (Batch 7):**

| File | Work |
|---|---|
| [lib/sync/updateRegionCounts.js](australian-atlas/lib/sync/updateRegionCounts.js) | Replace 30-line alias map + ilike logic with `count(*) WHERE region_computed_id = $1 OR region_override_id = $1` per region. **Verify per-region counts before/after to ensure editorial expectations hold.** |
| Misc one-off scripts | scripts/* — most are historical. Lower priority — defer or accept the legacy text reads in audit scripts. |

**Estimated size: small.** Single file core; rest is cleanup.

**Risk: medium.** Region counts will shift slightly — some regions gain (FK precision picks up listings that text-match missed), some lose (alias-mapped strings no longer count). Pre-compute the delta and review with editorial before applying.

## Recommended re-sequencing

The original 2-7 ordering still makes sense. The numbering shifts slightly because Batch 2 is mostly done:

1. **Batch 2-finish (next)** — display sites leftover. Small, mechanical, low risk. Good first follow-up to validate the helper pattern is sticking.
2. **Batch 3** — filter sites + URL contract. The biggest design work in step 1. Schedule when there's time for `api/search/route.js` rewrite + dual-acceptance helper extraction.
3. **Batch 4** — cross-listing recs. Once Batch 3 lands, cross-listing recs become mechanical.
4. **Batch 5** — editorial/agents. Embedding regen is the gating concern — could be sub-batched (everything except embeddings, then embeddings).
5. **Batch 6** — admin UI. Last because internal users can tolerate transition state.
6. **Batch 7** — updateRegionCounts cleanup.

**Total step 1 effort remaining: ~5 dev days** across 4 PRs. Batch 1's 35% completion was the biggest mechanical chunk; remaining batches are smaller per-batch but more design work in places (Batch 3 specifically).

---


**Date:** 2026-04-25
**Trigger:** Phase 2 backfill landed at commit `63929c4`. `region_computed_id` is now authoritative for ~5,580 of 6,510 active listings. Phase 3 deprecates the legacy `listings.region` text column; this discovery enumerates the read sites that must migrate first.
**Status:** Read-only enumeration — no code changes.

## TL;DR

| Metric | Value |
|---|---:|
| Production files reading `listings.region` (app/lib/components) | **~85** |
| Distinct read patterns | **8** |
| Filter/search endpoints accepting `?region=...` parameter | **5** |
| Components rendering region as a UI string | **~10** (transitive via `ListingCard`/`jsonLd`) |
| Sync/agent files reading region | **~10** |
| One-off scripts reading region (lower priority — most are historical) | **~30** |
| Estimated migration scope | 4 batches × 1–2 days each = ~6 days dev work |

The single biggest concentration is in `app/place/[slug]/page.js` and the `/api/search` route. These two files exhibit nearly every read pattern that needs migrating; getting them right templates the rest.

## Read patterns (8)

### Pattern 1 — `select('id, name, …, region, state, …')` then access `.region` for display

By far the most common (~60 files). Pulls `region` as part of a wider field list, then either:

- Renders directly as a display string in `[listing.region, listing.state].filter(Boolean).join(', ')`
- Passes through to `<ListingCard region={listing.region} />`
- Stores in JSON-LD `addressLocality`

Representative sites:

| File | Lines | What it does |
|---|---|---|
| [app/place/[slug]/page.js:97](australian-atlas/app/place/[slug]/page.js#L97) | 97-269 (5 selects) | Venue detail page — selects region in 5 places for hero, getRegionListings, cross-vertical, similar |
| [components/ListingCard.js:88](australian-atlas/components/ListingCard.js#L88) | 88, 103, 318, 324, 334 | Universal venue card — receives `region` prop, renders "Region, State" footer + passes to JSON-LD |
| [lib/jsonLd.js:79](australian-atlas/lib/jsonLd.js#L79) | 79, 83 | `addressLocality: listing.region` in schema.org PostalAddress |
| [app/seo/[slug]/page.js:77](australian-atlas/app/seo/[slug]/page.js#L77) | 77, 78 | SEO landing page selects region for surrounding-listings query |
| [app/og/[slug]/route.js:42](australian-atlas/app/og/[slug]/route.js#L42) | 42, 43 | OpenGraph image generation includes region in caption |

**Migration shape:** `select('region')` → `select('region_text:region, region:regions!region_computed_id(name, slug)')`, then access `listing.region?.name ?? listing.region_text` for display. Aliasing the legacy text column to `region_text` lets the joined `region` object take the canonical name slot.

**Risk:** **Medium**. Display strings will subtly change for ~73 listings whose source text differs from canonical (e.g. "Pokolbin" → "Hunter Valley"). User-visible. Decision needed (see Decisions section).

### Pattern 2 — `.eq('region', value)` filter

Used to find listings whose region text matches a specific string. **8 production sites.**

| File | Line | What it filters |
|---|---|---|
| [app/regions/[slug]/page.js:108](australian-atlas/app/regions/[slug]/page.js#L108) | 108 | All listings whose `region` text equals the regions row's `name` |
| [app/place/[slug]/page.js:233,249](australian-atlas/app/place/[slug]/page.js#L233) | 233, 249 | Find other listings in same region for cross-recs |
| [app/page.js:213](australian-atlas/app/page.js#L213) | 213 | Homepage region filter |
| [app/api/admin/listings/route.js:56,76](australian-atlas/app/api/admin/listings/route.js#L56) | 56, 76 | Admin listings filter by region URL param |
| [app/api/search/route.js:351](australian-atlas/app/api/search/route.js#L351) | 351 | Public search — exact region match on URL param |

**Migration shape:** `.eq('region', name)` → `.eq('region_computed_id', regionRow.id)`. Caller must look up the regions row first by slug or name.

**Risk:** **Medium-high** for `app/regions/[slug]/page.js` — this is the canonical region detail page, currently relies on text-match against the regions table's name (which has alias bugs surfaced in `lib/sync/updateRegionCounts.js`). Migration to FK is strictly correct but switches the scoping model.

### Pattern 3 — `.ilike('region', %text%)` fuzzy match

The fuzziest pattern. Used when source listing text is messy (street addresses in region field, varied capitalisation, alias names). **11 sites.**

| File | Line | Use |
|---|---|---|
| [lib/sync/updateRegionCounts.js:84,97](australian-atlas/lib/sync/updateRegionCounts.js#L84) | 84, 97 | Counts listings per region via fuzzy text match + alias map |
| [app/api/search/route.js:374,385,420,428,462](australian-atlas/app/api/search/route.js#L374) | many | Search ranking — region is one OR'd field in fuzzy text search |
| [app/api/v1/venues/route.js:58](australian-atlas/app/api/v1/venues/route.js#L58) | 58 | Public venues API filter |
| [app/api/v1/regions/[slug]/venues/route.js:54](australian-atlas/app/api/v1/regions/[slug]/venues/route.js#L54) | 54 | Public region-venues API filter |
| [components/RelatedContent.js:30](australian-atlas/components/RelatedContent.js#L30) | 30 | Related-content component fuzzy region match |
| [app/admin/staleness/page.js:101](australian-atlas/app/admin/staleness/page.js#L101) | 101 | Admin staleness filter |

**Migration shape:** `.ilike('region', %x%)` → either drop entirely (FK-based filter is now precise) or convert to FK lookup. For search ranking specifically, the `region` text contributes to fuzzy tiering — Phase 3 may need to substitute with `regions.name` joined inline, or keep ilike on the legacy column as a transition fallback.

**Risk:** **High** for `lib/sync/updateRegionCounts.js` — this is the source of truth for `regions.listing_count` denormalisation. Replacing fuzzy text + alias matching with FK count is strictly better, but the count semantics change subtly (FK-counted = computed_id+override_id, legacy = ilike text-match). Worth a separate migration with verification.

### Pattern 4 — `searchParams.get('region')` URL param

Public-facing parameter contract. **5 routes:**

| File | Line | Behaviour |
|---|---|---|
| [app/search/page.js:220](australian-atlas/app/search/page.js#L220) | 220 | Search form pre-fill from URL |
| [app/api/admin/listings/route.js:36](australian-atlas/app/api/admin/listings/route.js#L36) | 36 | Admin filter |
| [app/api/v1/venues/route.js:46](australian-atlas/app/api/v1/venues/route.js#L46) | 46 | Public API |
| [app/api/council/data/route.js:95](australian-atlas/app/api/council/data/route.js#L95) | 95 | Council partner data export |
| [app/api/search/route.js:336](australian-atlas/app/api/search/route.js#L336) | 336 | Public search |

These are external-contract surfaces. URLs like `?region=hunter-valley` (slug) or `?region=Hunter%20Valley` (name) may be in shared links, partner integrations, sitemaps. **Decision needed on slug vs. name vs. id matching.**

**Migration shape:** Update internal filter to use FK lookup, but the URL parameter format itself needs decision (see Decisions section).

**Risk:** **High** — URL stability matters for SEO and link sharing. Shouldn't break existing URLs without 301 redirects.

### Pattern 5 — Cross-listing recommendation joins

Listings recommend "other listings in the same region" using region as join key. **~6 components.**

| File | Pattern |
|---|---|
| `components/NearbySection.js`, `WhatsNearby.js`, `WhatsNearbyStandalone.js`, `CrossVerticalNearby.js`, `SameSpirit.js`, `RelatedContent.js` | All select related listings filtered by region/vertical |
| `app/api/similar/route.js` | Returns "similar" listings — region is one of the matching axes |

**Migration shape:** `.eq('region', currentListing.region)` → `.eq('region_computed_id', currentListing.region_computed_id)`. Both reads change, but the access pattern is symmetric so the migration is straightforward once `region_computed_id` is in the select shape.

**Risk:** **Low**. Behaviour is functionally equivalent — listings in the same region still recommend each other. Edge case: when `region_computed_id` is NULL on either listing, fall back behaviour needs a decision (currently returns no recs; could fall back to text match for the 917 NULLs but introduces dual-mode logic).

### Pattern 6 — Editorial / agent read sites

Background processes that consume region for editorial generation, content scoring, agent decisions. **~10 files.**

| File | What it does |
|---|---|
| [lib/sync/syncEmbeddings.js:28](australian-atlas/lib/sync/syncEmbeddings.js#L28) | Includes `region` text in the embedding-input string |
| [scripts/generate-region-narratives.mjs:95](australian-atlas/scripts/generate-region-narratives.mjs#L95) | Aggregates listings per region for narrative generation |
| [scripts/generate-region-editorial.mjs:67](australian-atlas/scripts/generate-region-editorial.mjs#L67) | Editorial pipeline — fuzzy match listings to a region |
| [scripts/generate-editorial-brief.mjs:79](australian-atlas/scripts/generate-editorial-brief.mjs#L79) | Per-listing editorial brief — uses listing.region for context |
| [app/api/cron/enrichment-agent/route.js](australian-atlas/app/api/cron/enrichment-agent/route.js) | Per the autonomous agents fleet — selects region |
| [app/api/cron/listing-velocity-agent/route.js](australian-atlas/app/api/cron/listing-velocity-agent/route.js) | Same pattern |
| [app/api/cron/revenue-signal-agent/route.js](australian-atlas/app/api/cron/revenue-signal-agent/route.js) | Same |
| [app/api/cron/user-reactivation-agent/route.js](australian-atlas/app/api/cron/user-reactivation-agent/route.js) | Same |
| [app/api/cron/seo-content-agent/route.js](australian-atlas/app/api/cron/seo-content-agent/route.js) | Same |
| [app/api/cron/editorial-signals-agent/route.js](australian-atlas/app/api/cron/editorial-signals-agent/route.js) | Same |
| [app/api/cron/backlink-builder-agent/route.js](australian-atlas/app/api/cron/backlink-builder-agent/route.js) | Same |

**Migration shape:** Vary per agent. Embedding generation (`syncEmbeddings.js`) likely benefits from canonical region name in the embedding text — **migration improves quality**. Editorial pipelines should switch to FK joins for consistency.

**Risk:** **Medium**. Some agents may make decisions based on region presence/absence — switching from text to FK changes the NULL semantics (917 listings now formally NULL where previously they had a non-empty region text).

### Pattern 7 — Admin / staff UI

Internal staff-facing reads. **~15 files.**

Admin pages that read region for filtering, sorting, or display:
[app/admin/listings/page.js](australian-atlas/app/admin/listings/page.js), [app/admin/listings/ListingEditor.js](australian-atlas/app/admin/listings/ListingEditor.js), [app/admin/quality-report/page.js](australian-atlas/app/admin/quality-report/page.js), [app/admin/duplicates/page.js](australian-atlas/app/admin/duplicates/page.js), [app/admin/dead-images/page.js](australian-atlas/app/admin/dead-images/page.js), [app/admin/audit-review/page.js](australian-atlas/app/admin/audit-review/page.js), [app/admin/listings-review/page.js](australian-atlas/app/admin/listings-review/page.js), [app/admin/staleness/page.js](australian-atlas/app/admin/staleness/page.js), [app/admin/enrichment-audit/page.js](australian-atlas/app/admin/enrichment-audit/page.js), [app/admin/enrichment-review/page.js](australian-atlas/app/admin/enrichment-review/page.js), [app/admin/outreach/page.js](australian-atlas/app/admin/outreach/page.js), [app/admin/revenue/page.js](australian-atlas/app/admin/revenue/page.js), [app/admin/heritage-crosslinks/page.js](australian-atlas/app/admin/heritage-crosslinks/page.js), [app/admin/wikipedia-queue/page.js](australian-atlas/app/admin/wikipedia-queue/page.js), [app/admin/health/page.js](australian-atlas/app/admin/health/page.js)

**Migration shape:** Same as Pattern 1 — select join, render canonical name. Many admin pages also display the legacy text alongside (so the operator can see source-text vs. computed mismatches). Worth keeping the text visible in admin even after Phase 3 deprecation.

**Risk:** **Low**. Internal staff. Mistakes are caught quickly; rollback is per-file.

### Pattern 8 — Sync / write sites (out of scope, noted)

These WRITE region from vertical → portal. Phase 3 step 2 task, not step 1.

| File | Function |
|---|---|
| [lib/sync/fieldMaps.js:70,118,160,208,253,297,344,397,441,483](australian-atlas/lib/sync/fieldMaps.js#L70) | Maps each vertical's `sub_region`/`suburb`/`city` field to portal `region` (text). 10 vertical-specific mappers, all write region. |
| [lib/sync/syncVertical.js](australian-atlas/lib/sync/syncVertical.js) | Comments only — actual writes go through fieldMaps |
| [lib/admin/updateListing.js:126](australian-atlas/lib/admin/updateListing.js#L126) | Admin edit can update region text directly |

**NOT MIGRATED IN STEP 1.** Listed for context.

## Decisions Matt needs to make before migration starts

### Decision 1 — Display-string source

When showing a region name in UI (card footer, breadcrumb, JSON-LD), the migrated path is `regions.name` via FK join. **What to do when `region_computed_id` is NULL?** (917 listings — quarantine pool.)

Three options:

| Option | UI behaviour | Pros | Cons |
|---|---|---|---|
| **A.** Strict — show empty / "Region pending" | Cards show only state | Clean — surfaces quarantine clearly | 917 cards lose location context |
| **B.** Fall back to legacy text | Cards show "Pokolbin, NSW" if computed_id NULL | Preserves current UX for NULL set | Maintains dual-source dependency through Phase 3 |
| **C.** Fall back, but flag in admin | Cards show legacy text; admin sees a "needs override" indicator | Best UX + actionable signal | More complexity in components |

**Recommendation:** **B** for end-user UI (preserves info), **C** for admin. Phase 3 step 3 (column drop) eventually forces A.

### Decision 2 — URL parameter format for `?region=`

Currently 5 routes accept `?region=...` and apply text match. After Phase 3 they should match against the FK. The parameter value in URLs:

| Option | Example URL | Pros | Cons |
|---|---|---|---|
| **A.** Slug | `?region=hunter-valley` | Stable, canonical, SEO-friendly | Existing links using human names break |
| **B.** Name | `?region=Hunter%20Valley` | Backward-compatible with current behaviour | Encoding issues; sensitive to renames |
| **C.** Both — accept either | Mixed | Smoothest migration | More code, possible ambiguity |

**Recommendation:** **C** for the migration window — accept slug or name in the parameter, look up the regions row by either, then filter by FK. Once migration settles, update internal links to canonical slug. SEO redirects (301) for old name-based URLs eventually.

### Decision 3 — Override-vs-computed precedence in reads

Architecture spec says `region_override_id` takes precedence over `region_computed_id`. Reads need to honor this — usually via:

```sql
COALESCE(region_override_id, region_computed_id) AS effective_region_id
```

Or in supabase-js select shape:

```js
.select('region:regions!region_override_id(name, slug), region_computed:regions!region_computed_id(name, slug)')
// then in code: listing.region ?? listing.region_computed
```

**Decision:** confirm the COALESCE semantics, and confirm whether override-applied listings are visible in admin separately (so staff can see which listings are admin-curated vs. trigger-computed).

**Recommendation:** Always read both, derive `effective_region_id` in app code, surface override status in admin views.

### Decision 4 — Sitemap / SEO impact

`app/seo/[slug]/page.js` and `app/og/[slug]/route.js` produce URLs and metadata derived from region text. Critical for indexed pages.

**Question:** Do existing sitemap entries include the listing.region text in any URL or canonical tag? Any change shifts the indexed URL set if so.

**Action:** Audit existing sitemap output before migration. If sitemap URLs include region text or hash, plan a 301 redirect map.

### Decision 5 — Quarantine / legacy text retention period

After all reads migrate to FK, the 917 quarantined listings still have `listings.region` text (e.g. "Riverina") but no FK. They'll show empty in UI under Decision 1A.

**Question:** How long should the legacy `region` text column be retained as a fallback / admin reference before Phase 3 step 3 drops it?

**Recommendation:** 30-day window after step 1 completes — enough to surface any missed read sites in production logs, before column drop. Admin UI continues to show legacy text throughout.

## Recommended migration order

| # | Batch | Files | Risk | Order rationale |
|---|---|---|---|---|
| **1** | Read shape — alias `region` → `region_text`, add joined `region` | All 85 SDK select sites | Low (mechanical) | Refactor read shape first; doesn't change behaviour. Enables Batch 2-5 to use new field name. |
| **2** | Display sites — `ListingCard`, `jsonLd`, place page header | ~10 | Medium (visible) | After Batch 1; flip access from `listing.region` to `listing.region?.name ?? listing.region_text`. |
| **3** | Filter sites — `.eq` and `.ilike` callers | 8 + 11 | Medium-high | Switch to FK lookup. URL param decision (D2) gates the public-facing routes. |
| **4** | Cross-listing recs — same-region joins | ~6 components | Low | Symmetric switch — both sides of the join move to FK simultaneously. |
| **5** | Editorial / agents — embedding text, narrative gen | ~10 | Medium | Last because some agents benefit from canonical names (Batch 1 already fixed shape). |
| **6** | Admin UI | ~15 | Low | Last because admin has tolerance for transition state. |
| **7** | Drop `lib/sync/updateRegionCounts.js` ilike+alias logic | 1 | Medium | Replace with FK count via `count(*)` on listings filtered by `effective_region_id`. Verify per-region counts match before/after. |

Estimated effort: **~6 dev days** across 4 PRs (Batch 1 + Batch 2-3 + Batch 4-5 + Batch 6-7).

## Risk assessment per batch

| Batch | Top risks |
|---|---|
| 1 | Forgot a select site → runtime error on `.region.name` access. **Mitigation:** TypeScript types could enforce, but project is JS — rely on grep + manual review + dev/staging soak. |
| 2 | Visible UI regression: cards display canonical "Hunter Valley" instead of operator's text "Pokolbin". Some venues prefer the local sub-region name. **Mitigation:** Decision 1 outcome; plan staged rollout. |
| 3 | URL param breakage shifts SEO traffic. **Mitigation:** Decision 2 + 301 redirect map. |
| 4 | NULL handling: cross-recs return zero results for quarantined listings. **Mitigation:** Decision 1 fallback if `region_computed_id` is NULL. |
| 5 | Embedding regeneration cost: if `syncEmbeddings.js` text changes, all 6,510 listings need re-embedding. **Mitigation:** Plan embedding refresh as a separate batch run, not on every push. |
| 6 | Admin productivity dip during transition. **Mitigation:** Internal users tolerate; train operators on new column shape. |
| 7 | Region counts shift — some regions gain or lose listings under FK semantics. **Mitigation:** Pre-compute count delta, review with editorial before flipping. |

## Out of scope

- Write sites in `lib/sync/fieldMaps.js`, `syncVertical.js`, `updateListing.js` — Phase 3 step 2.
- The legacy column drop — Phase 3 step 3.
- New columns / schema changes — none planned in step 1.
- Vertical-side region columns (each vertical DB has its own, with different semantics) — out of scope; this is portal-only.

## Source files touched in producing this report

Read-only greps. No code changed.
