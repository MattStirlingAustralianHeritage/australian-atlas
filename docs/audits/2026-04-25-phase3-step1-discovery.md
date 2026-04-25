# Phase 3 Step 1 — Read-site Discovery for `listings.region`

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
