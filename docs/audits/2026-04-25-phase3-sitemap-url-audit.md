# Phase 3 Sitemap & SEO URL Audit

**Date:** 2026-04-25
**Trigger:** Pre-flight for Phase 3 step 1 read-site refactoring. URL parameter policy decided as: accept slug-shaped and name-shaped `?region=` during migration window, 301 redirect name→slug, drop dual-acceptance after migration.
**Status:** Read-only enumeration — no code changes.

## TL;DR

| Surface | Region URL pattern | Migration-safe? |
|---|---|---|
| **Sitemap.xml** | `/regions/{slug}` only | ✓ already slug-based |
| **Canonical tags** | `/regions/{slug}`, `/place/{slug}` | ✓ already slug-based |
| **JSON-LD `regionJsonLd`** | `/regions/{slug}` | ✓ already slug-based |
| **JSON-LD `addressLocality`** | not a URL — listings.region text in schema.org metadata | covered by Phase 3 step 1 read-site refactor |
| **Region detail breadcrumb** | `/regions/{slug}` | ✓ already slug-based |
| **Editorial-signals email links** | `/regions/{slug}` | ✓ already slug-based |
| **RegionalBacklink component** | `/regions/{slug}` | ✓ already slug-based |
| **Council region link** | `/council/region?r={slug}` | ✓ already slug-based |
| **Place page breadcrumb fallback** | `/search?region={text}` when no `regions` row matches | ⚠ falls back to legacy text; affects ~917 quarantine listings |
| **Region page → map link** | `/map?vertical=X&region={name}` | ⚠ uses name not slug |
| **SEO page → trail-builder link** | `/trails/builder?region={name}` | ⚠ uses name not slug |
| **Homepage hardcoded region cards** | `/regions/{name.lowercase().replace(/\s/g,'-')}` | ⚠ brittle but works (6 hardcoded names) |

**Bottom line:** the **sitemap itself is fully slug-based and migration-safe**. None of the indexed URLs reference listings.region text. The few region-text URL params surfaced are all internal links between pages (filters, navigation), not surfaces Google indexes.

The decided URL policy (accept-both, 301 name→slug, then drop) handles the 4 ⚠ cases without any redirect-map or sitemap changes.

## Sitemap inventory ([app/sitemap.js](australian-atlas/app/sitemap.js))

The sitemap generator emits 7 URL patterns. None include region text:

| URL pattern | Source table.column | Region involvement |
|---|---|---|
| `/` plus 17 static pages | hardcoded | none |
| `/place/{slug}` | `listings.slug` | none |
| `/regions/{slug}` | **`regions.slug`** | ✓ slug-based |
| `/trails/{slug}` | `trails.slug` | none |
| `/events/{slug}` | `events.slug` | none |
| `/journal/{slug}` | `articles.slug` | none |
| `/seo/{slug}` | `seo_pages.slug` | none |

The `/regions/{slug}` URLs come from `regions.slug` (the regions table's own column), **not** from `listings.region` text. These URLs are stable across Phase 3 — they won't change when the listings.region column is deprecated.

robots.js declares the sitemap canonically. No region-related disallows.

## Per-pattern findings

### ✓ Pattern 1 — `/regions/{slug}` canonical pattern (8 sites, all safe)

All emit `regions.slug` directly. Migration-safe:

| File | Line | Code |
|---|---|---|
| [app/sitemap.js:103](australian-atlas/app/sitemap.js#L103) | 103 | `${SITE_URL}/regions/${r.slug}` |
| [lib/jsonLd.js:147](australian-atlas/lib/jsonLd.js#L147) | 147 | `${SITE_URL}/regions/${region.slug}` (regionJsonLd structured-data url) |
| [components/RegionalBacklink.js:63](australian-atlas/components/RegionalBacklink.js#L63) | 63 | `https://australianatlas.com.au/regions/${regionSlug}` (operator backlink) |
| [components/RegionMapCard.js:107](australian-atlas/components/RegionMapCard.js#L107) | 107 | `/regions/${region.slug}` |
| [app/regions/[slug]/page.js:165](australian-atlas/app/regions/[slug]/page.js#L165) | 165 | `https://australianatlas.com.au/regions/${slug}` (canonical tag) |
| [app/network/page.js:226](australian-atlas/app/network/page.js#L226) | 226 | `/regions/${r.slug}` |
| [app/api/cron/editorial-signals-agent/route.js:473](australian-atlas/app/api/cron/editorial-signals-agent/route.js#L473) | 473 | email body — `regions/${esc(r.slug)}` |
| [app/seo/[slug]/page.js:330](australian-atlas/app/seo/[slug]/page.js#L330) | 330 | `/regions/${regionData.slug}` |

### ✓ Pattern 2 — Council region link (slug-based)

| File | Line | Code |
|---|---|---|
| [app/council/region/page.js:71](australian-atlas/app/council/region/page.js#L71) | 71 | `/council/region?r=${r.slug}` |
| [app/council/page.js:155](australian-atlas/app/council/page.js#L155) | 155 | `/council/region?r=${region.slug}` |
| [app/council/region/page.js:30](australian-atlas/app/council/region/page.js#L30) | 30 | `/api/council/data?view=listings&region=${region.slug}` |

The `?region=` API param here uses slug. Already migration-aligned.

### ⚠ Pattern 3 — Place page breadcrumb fallback (3 sites, fallback path only)

When the place page can find a `regions` row matching the listing's text region, it emits `/regions/{slug}`. Otherwise falls back to `/search?region={text}`:

| File | Line | Code |
|---|---|---|
| [app/place/[slug]/page.js:513](australian-atlas/app/place/[slug]/page.js#L513) | 513 | `regionData ? /regions/${regionData.slug} : /search?region=${encodeURIComponent(listing.region)}` |
| [app/place/[slug]/page.js:624](australian-atlas/app/place/[slug]/page.js#L624) | 624 | same |
| [app/place/[slug]/page.js:807](australian-atlas/app/place/[slug]/page.js#L807) | 807 | same |

**Scope:** the fallback fires only for listings whose text region doesn't match any regions row by ilike — i.e. roughly the 917 quarantine listings with `region_computed_id = NULL`.

**Migration shape under decided policy:** these fallback links emit URLs like `/search?region=Pokolbin` or `/search?region=Riverina`. Once `/api/search` accepts both slug and name (the decided policy), these URLs continue to work unchanged. After Phase 3 settles and dual-acceptance is dropped, the place page should switch to: prefer `region_computed_id`/`region_override_id` slug, no name fallback.

**Action required:** none for migration window. After dual-acceptance drops, refactor the breadcrumb to use the FK-derived slug exclusively.

### ⚠ Pattern 4 — Region detail page → map link (1 site, name-based)

| File | Line | Code |
|---|---|---|
| [app/regions/[slug]/page.js:620](australian-atlas/app/regions/[slug]/page.js#L620) | 620 | `/map?vertical=${vertical}&region=${encodeURIComponent(region.name)}` |

This is on the canonical region detail page. Each vertical pill links to `/map?vertical=X&region=Hunter%20Valley`-style URLs.

**Migration shape under decided policy:** `/map` route accepts both name and slug, 301s name→slug, then drop. Source code can be updated to emit slug directly post-migration.

**Action required:** none for migration window. Refactor to slug after dual-acceptance period.

### ⚠ Pattern 5 — SEO page → trail-builder link (1 site, name-based)

| File | Line | Code |
|---|---|---|
| [app/seo/[slug]/page.js:346](australian-atlas/app/seo/[slug]/page.js#L346) | 346 | `/trails/builder${regionName ? '?region=' + encodeURIComponent(regionName) : ''}` |

The trail-builder accepts a `?region=` query param to pre-populate. Currently passed as name.

**Action required:** none for migration window — `/trails/builder` should be added to the dual-acceptance route list. Refactor to slug post-migration.

### ⚠ Pattern 6 — Homepage hardcoded region cards (1 site, brittle slugification)

| File | Line | Code |
|---|---|---|
| [app/page.js:728](australian-atlas/app/page.js#L728) | 728 | `/regions/${r.name.toLowerCase().replace(/\s+/g, '-')}` |

Homepage hardcodes 6 region cards (Hunter Valley, Adelaide Hills, Blue Mountains, etc.) with `{name, state}` shape and slugifies the name client-side. Works because the 6 names happen to match their regions.slug entries 1:1.

**Risk:** if a future region's slug doesn't match its lowercase-dashed name, the link 404s. Currently safe but brittle.

**Action required:** none for migration. **Cleanup recommendation** (not a Phase 3 blocker): change the hardcoded list to include explicit slugs:

```js
{ name: 'Adelaide Hills', slug: 'adelaide-hills', state: 'SA' }
```

Removes the slugification gymnastics and prevents future drift.

### Pattern 7 — `/itinerary?q={text}` itinerary alts (1 site, query param not region param)

| File | Line | Code |
|---|---|---|
| [app/itinerary/page.js:418](australian-atlas/app/itinerary/page.js#L418) | 418 | `/itinerary?q=${encodeURIComponent(alt.region)}` |

This passes region text in the `q` (search query) param, not `region` param. The itinerary builder treats `q` as a free-text search. Not affected by the `?region=` policy.

**Action required:** none.

## JSON-LD structured-data audit

[lib/jsonLd.js](australian-atlas/lib/jsonLd.js) emits two types of region references:

1. **`addressLocality: listing.region`** at [line 83](australian-atlas/lib/jsonLd.js#L83) — schema.org PostalAddress on listing pages. Not a URL — metadata string. Read-site refactor in Phase 3 step 1 changes this from `listing.region` text to canonical `effective_region.name` (preferring override→computed). Listed in [Phase 3 discovery doc](2026-04-25-phase3-step1-discovery.md) under Pattern 1.

2. **`url: ${SITE_URL}/regions/${region.slug}`** at [line 147](australian-atlas/lib/jsonLd.js#L147) — `regionJsonLd` for region pages. Already slug-based. Migration-safe.

## OpenGraph / og:url audit

Spot-checked og: tag generation in `app/place/[slug]/page.js` and `app/regions/[slug]/page.js`. Both use the same canonical URL value as the `<link rel="canonical">` tag — slug-based for `/regions/{slug}` and `/place/{slug}`. No region text in og:url anywhere.

## Email templates audit

Searched for region URL patterns in cron-agent email bodies (the 15 autonomous agents). Found one:

[app/api/cron/editorial-signals-agent/route.js:473](australian-atlas/app/api/cron/editorial-signals-agent/route.js#L473) emits `https://australianatlas.com.au/regions/${esc(r.slug)}` — slug-based.

No other email templates reference regions in URLs.

## Mapbox / external embed audit

Mapbox usage is for static map images (`api.mapbox.com/styles/v1/...`) and inline JS. URL params passed are `lat,lng,zoom`, not region text. None of the Mapbox URLs include `?region=` or any region-named param. ✓

## Summary — what to do

**Before Batch 1 starts:** nothing. The sitemap and indexed URLs are already migration-safe.

**During the migration window (Batches 1-3):**

1. **`/api/search`** — already on the dual-acceptance list per the decided policy. Accept slug or name in `?region=`, look up regions row, filter by FK.
2. **`/map`** — needs to be added to dual-acceptance list. Same pattern.
3. **`/trails/builder`** — needs to be added to dual-acceptance list. Same pattern.

These are the three routes that currently receive name-shaped `?region=` values.

**After dual-acceptance window ends:**

1. Refactor [app/place/[slug]/page.js:513,624,807](australian-atlas/app/place/[slug]/page.js#L513) to use only `effective_region.slug`, drop the listing.region-text fallback (the 917 quarantine listings would emit no fallback link — display empty or "—").
2. Refactor [app/regions/[slug]/page.js:620](australian-atlas/app/regions/[slug]/page.js#L620) to emit slug.
3. Refactor [app/seo/[slug]/page.js:346](australian-atlas/app/seo/[slug]/page.js#L346) to emit slug.

**Bonus cleanup (optional, non-blocking):**

[app/page.js:728](australian-atlas/app/page.js#L728) — replace name-slugification with explicit slug field in the hardcoded region cards array.

## What didn't surface (negative findings)

- No region text in any indexed sitemap URL.
- No region text in any canonical tag.
- No region text in any og:url.
- No region text in any structured-data url field.
- No external partner integrations or webhook URLs surfaced that reference region text.
- No URL-shortener or redirect tables (e.g. supabase tables holding URL state) that could surface stale region URLs.
- No PDF/email export URLs that include region text — checked operator export PDF route.
