# What We Built — Night 3

**Date:** 2026-04-13
**Sprint:** Night 3 — "Make people fall in love with the product"

---

## ✓ Shipped

### Phase 1: Long Weekend Engine (`/long-weekend`)
- Full interactive trip planner: pick a city, radius, group type, vibe
- Claude-powered itinerary generation from real listings within bounding box
- Region clustering for multi-stop weekend plans
- Save & share functionality
- **API:** `POST /api/long-weekend` — bounding box query → cluster → Claude itinerary

### Phase 2: "In the Same Spirit" (`components/SameSpirit.js`)
- pgvector cosine similarity via `match_similar_listings()` RPC
- Cross-vertical recommendations on every listing detail page
- Fallback to region-based suggestions when embeddings unavailable
- **Migration:** `070_similar_listings_rpc.sql`
- **API:** `GET /api/similar?id=<listing_id>`

### Phase 3: "On This Road" (`/on-this-road`)
- Interactive road trip planner with origin/destination autocomplete
- Mapbox Directions API for real route geometry
- Buffer query finds listings within corridor
- Claude selects best stops from results
- Full Mapbox GL map with route line + stop markers
- **API:** `POST /api/on-this-road`, `GET /api/mapbox/geocode`

### Phase 5: Atlas Index (`/atlas-index`)
- Complete A-Z directory of every active listing in the network
- Letter-based navigation with IntersectionObserver for active letter tracking
- Vertical + state filters
- Paginated loading (1000 per batch) for full dataset
- `force-dynamic` rendering (no ISR conflict with service role client)

### Phase 6: Search Improvements
- **Vibe Search** (`/api/search/vibe`): natural language → Claude intent extraction → pgvector semantic search
- Clean editorial UI with toggle between keyword and vibe modes
- Contextual search headers based on query type

### Phase 8: Performance & SEO
- ISR tuning: homepage 300→1800s, regions 3600→21600s, collections 3600→7200s
- Canonical URLs via `alternates.canonical` in generateMetadata
- Sitemap updated with all new routes: /long-weekend, /on-this-road, /discover, /for-you, /atlas-index

### Phase 9: Human Things
- About page rewritten: "One person" (not "Small team"), personal story, direct tone
- Homepage headline: "Nine atlases. One guide to independent Australia."
- Long Weekend Engine featured on homepage

### Data Quality (Bonus)
- **Adelaide Lead geocoding fix**: Possum Gully Fine Arts corrected from Adelaide SA → Adelaide Lead VIC
- **State/postcode audit**: 164 listings with wrong state assignments found and fixed
- **Geocoding Watchdog**: Added state boundary validation + postcode cross-check
- **Collections cross-vertical enforcement**: 40% max single-vertical rule added at generation + API level

### Cross-Vertical (Small Batch Atlas)
- **Furneaux article 404 fixed**: Article inserted into portal DB, local fallback added to detail page
- **Homepage journal section**: Now merges portal + local articles (deduplicated), shows 3+ most recent

---

## ⚠️ Partial

### Phase 4: Collections Completion
- Cross-vertical diversity validation shipped (audit script, seed script, API enforcement)
- Sydney Makers audit: confirmed 100% Craft, partially fixed but limited by available non-Craft data in Sydney area
- Remaining: generate 10 new collections, publish best 5

### Phase 7: Operator Platform
- Outreach queue built (`/admin/outreach`) with draft email, mark contacted, notes
- Operator dashboard stats endpoint live (`/api/dashboard/stats`)
- Completeness nudges on dashboard
- Stripe audit completed — 3 subscription flows working, webhook idempotent
- Remaining: renewal reminders, lapsed handling, /admin/subscriptions page

---

## ✓ Also Shipped (Continuation Sprint)

### SBA Journal Index Page Fix
- Journal index (`/journal`) now merges portal + local articles (was single-source fallback)
- Articles sorted by published_at descending across both sources
- Mirrors the homepage dual-source merge pattern

### Regions `generateStaticParams`
- All 55 region detail pages now pre-generated at build time (was on-demand ISR)
- Eliminates cold starts for rarely-visited regions
- Build output confirms: `/regions/[slug]` with 55 paths pre-built

### 10 New Cross-Vertical Collections
- Added to seed script: Adelaide's Creative Quarter, Brisbane Hidden Gems, Perth Independents, The Makers Trail, Weekend Food & Wine, Daylesford & Hepburn Springs, Blue Mountains Independents, Vintage & Found, Sustainable & Ethical, Mornington Peninsula Circuit
- All enforce >=3 verticals, <=40% single vertical
- Ready to seed: `node --env-file=.env.local scripts/seed-collections.mjs`

### Table Atlas Dynamic Counts
- Replaced hardcoded `CATEGORY_COUNTS` with live Supabase query
- Category counts now auto-update as listings are added/removed

### Full Vertical Audit
- Audited all 9 vertical homepages — all production-ready
- Table Atlas confirmed fully independent (own Supabase, 36 routes, own styling)

---

## ✗ Not Reached

- Search 30-query smoke test
- Turkey Flat listing verification (exists in SBA DB as `turkey-flat`, needs live site check)

---

## 🆕 New Issues Discovered

1. **Portal-to-vertical sync gap**: Articles can exist in vertical DBs but not portal, causing 404s when portal client is configured. Fixed with dual-source merge pattern.
2. **Systemic state assignment bug**: 164 listings (mostly Craft) stored with wrong state — likely prospector defaulting to NSW during import.
3. **Collections single-vertical problem**: 4 of 5 existing collections fail diversity check. Generation pipeline wasn't enforcing cross-vertical selection.
4. **UUID string comparison**: `Math.min()` returns NaN on UUID strings — affected duplicate detection. Fixed with string comparison.

---

## 📊 Numbers

| Metric | Count |
|--------|-------|
| New pages shipped | 11 |
| New API routes | 12 |
| New components | 14 |
| Migrations created | 2 |
| State mismatches fixed | 164 |
| Duplicate pairs detected | 804 |
| Collections defined | 15 (5 existing + 10 new) |
| Region pages pre-built | 55 |
| Verticals audited | 9/9 production-ready |
| Vertical fixes applied | 3 (SBA journal, Table counts, SBA homepage) |
| Lines of code (est.) | ~5,500 |
| Build status | ✓ All clean (Atlas, SBA, Table) |

---

## 💡 Three Highest-Impact Things

1. **Long Weekend Engine** — Turns a database of listings into a trip planning tool. Nobody else does this for independent Australian businesses.

2. **"In the Same Spirit" cross-vertical discovery** — A craft distillery page now shows a nearby ceramicist and a farm-gate producer. This is what makes the network more than the sum of its verticals.

3. **State/postcode data quality fix** — 164 listings were appearing in the wrong state. Every one of those was a trust-destroying error for anyone who noticed. Now fixed, and the watchdog prevents recurrence.

---

## 🎯 The Single Feature

**Long Weekend Engine.** A person types "Melbourne, 2 hours, couple, wine country vibe" and gets back a real weekend plan built from real independent places. Not sponsored content. Not TripAdvisor reviews. A curated itinerary from places we've verified, stitched together by AI that understands the region.

That's the moment someone goes from "this is a directory" to "this is my guide to Australia."

---

## Migrations to Run

The following SQL migrations need to be executed in the Supabase SQL Editor (no DATABASE_URL configured for CLI):

- `supabase/migrations/069_sprint_night2.sql` — user_views, serendipity_saves, user_dismissals
- `supabase/migrations/070_similar_listings_rpc.sql` — match_similar_listings() pgvector function

---

*Sprint completed 2026-04-13. Built by one person and one AI, between midnight and dawn.*
