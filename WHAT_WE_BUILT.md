# The Australian Atlas Sprint
### One night. The whole thing.

---

## Summary

A single overnight sprint touching every layer of the Australian Atlas platform — from database migrations to search algorithms, from error boundaries to editorial pages, from duplicate detection to dynamic OG images. **42 features shipped across 8 phases.**

---

## Phase 0: Platform Audit

- Full audit of all Supabase tables, API routes, verticals, dependencies, and component inventory
- Identified 70+ instances of `select('*')` across API routes
- Mapped all admin page patterns and auth flows
- Catalogued search system architecture end-to-end
- **Security audit**: Found and fixed JWT parsing without signature verification in `/api/user/saves` and `/api/user/visits` (was using `atob(token.split('.')[1])` — now uses `verifySharedToken()` with HS256 verification)
- Flagged: admin-auth plaintext password comparison (recommend bcrypt), O(n) dashboard queries, non-persistent rate limiters

---

## Phase 1: Data Integrity

### Migration 061 — Sprint Infrastructure
`supabase/migrations/061_sprint_infrastructure.sql`

Comprehensive migration covering 16 sections:
- New listing columns: `street_address`, `suburb`, `postcode`, `quality_score`, `verified`, `verified_at`, `verification_source`, `completeness_score`, `editorial_rank`, `best_season`, `heritage_significance`, `night_friendly`, `founded_year`, `hours` (jsonb), `ai_description`, `ai_description_approved`, `search_vector` (tsvector)
- Full-text search with weighted tsvector (A: name, B: suburb/region, C: description) + auto-update trigger
- GIN index on search_vector
- New tables: `collections`, `place_memories`, `duplicate_pairs`, `client_errors`, `operator_outreach`, `listing_suggestions`, `events`, `interviews`, `listing_history`
- RPC functions: `search_listings_combined`, `autocomplete_listings`, `find_nearest_region`

### Migration 062 — Duplicate Merge Support
`supabase/migrations/062_duplicate_merge_support.sql`

Added `merged_into` column and `duplicate` status to listings for the merge workflow.

### Quality Score Calculator
`scripts/calculate-quality-scores.mjs`

Rubric: coords (20), description (20), website (20), region (15), subcategory (10), image (10), phone (5). Also calculates completeness_score. Dry-run mode with distribution reporting.

### Address Parser
`scripts/parse-addresses.mjs`

Australian address format parser extracting `street_address`, `suburb`, `state`, `postcode`. Handles multiple formats with confidence scoring.

### URL Staleness Checker
`scripts/check-url-staleness.mjs`

HEAD requests to every listing website. 500ms rate limiting, 10s timeout. Flags `url_dead` in `staleness_flags`, updates `last_verified_at`.

### Duplicate Detector
`scripts/detect-duplicates.mjs`

Three detection signals: same name+suburb, same website, trigram similarity >85%. Writes to `duplicate_pairs` table with confidence levels.

### Community Report System
- `app/api/community-report/route.js` — POST endpoint accepting permanently_closed, temporarily_closed, incorrect_info reports
- `components/ReportIssueModal.js` — Three-option modal with optional details textarea
- `components/ReportIssueButton.js` — Client wrapper managing modal state
- Wired into the listing detail page between CTA buttons and the details card

### Client Error Tracking
- `app/api/client-error/route.js` — POST endpoint logging to `client_errors` table
- `lib/reportClientError.js` — Fire-and-forget utility
- `components/ClientErrorBoundary.js` — React class component error boundary with auto-reporting
- `components/GlobalErrorReporter.js` — Catches `unhandledrejection` and `error` events globally
- Integrated into root layout

### Bulk Re-Geocode
917 coordinate fixes applied with safety guards: state matching, distance-based relevance gating, 100km auto-fix cap. 36 flagged for manual review.

---

## Phase 2: Search Rebuild

### Multi-Signal Ranked Search
`app/api/search/route.js` — Complete rewrite

- 4-stage query extraction: attributes → verticals → states → regions
- `STATE_KEYWORDS` map (all Australian states + abbreviations + colloquials like "tassie")
- `ATTRIBUTE_KEYWORDS` with multi-word phrases ("child friendly", "dog friendly", "wheelchair accessible")
- `REGION_KEYWORDS` covering 41 Australian regions
- 4-tier relevance scoring: exact match (300), partial/trigram (120-200), term match (50+), description only (10)
- Commercial boost: +2 claimed, +1 featured (within tiers, never cross-tier)
- Quality cap for >60 results
- Anonymous search logging to `search_logs`

### Autocomplete
- `app/api/autocomplete/route.js` — Parallel queries for name, suburb, and region matches
- `components/SearchAutocomplete.js` — Full autocomplete dropdown with:
  - 200ms debounced fetch with AbortController
  - Grouped results: Places, Suburbs, Regions with type-specific icons
  - Full keyboard navigation (arrows, Enter, Escape)
  - Click-outside detection
  - ARIA attributes for accessibility
  - Loading spinner
- Integrated into both search page and homepage search bar

### Search State Detection
- Auto-detected state highlights the state filter chip
- Contextual results messages: "X Small Batch results for 'query' in VIC"

---

## Phase 3: Discovery

### Collections
- `app/collections/page.js` — Index page with hero, grid of collection cards
- `app/collections/[slug]/page.js` — Detail page with ListingCards, JSON-LD ItemList, breadcrumbs
- `scripts/seed-collections.mjs` — Seeds 5 example collections from real listing data
- Added to nav between Trails and Journal

### A-Z Atlas Index
`app/atlas-index/page.js`

Typographic directory of every active listing:
- Paginated fetch handling >1000 listings
- Grouped by letter (A-Z plus # for numbers)
- Sticky alphabet nav with anchor links
- Compact rows with name, region, state, vertical badge
- Responsive: metadata hidden on mobile
- Added to nav

### Internal Linking on Listing Pages
`app/place/[slug]/page.js` — Major enhancement

- **"More in {region}"** section: 4 listings from same region, excluding already-shown nearby
- **"Explore this region"** banner: Links to `/regions/{slug}` or search fallback
- **"While you're in {region}, also discover"**: Cross-vertical listings from same region
- **Breadcrumb linking**: State → `/search?state=`, Region → `/regions/{slug}`
- Three new data fetching functions: `getRegionListings()`, `getCrossVerticalListings()`, region slug lookup

### Opening Hours Display
- `components/OpeningHours.js` — Client component with:
  - Collapsed mobile view (today only) with toggle
  - Consecutive day grouping (Mon-Fri: 9am-5pm)
  - "Open now" / "Closed now" indicator
  - Today highlighting
  - Hydration-safe (client-only time rendering)
- Added `hours` to listing detail page select
- Added `openingHoursSpecification` to JSON-LD structured data

---

## Phase 4: Operator Platform

### Operators Page Rewrite
`app/operators/page.js` — Complete rewrite

From a travel-designer SaaS pitch to a venue-operator claim-your-listing page:
- "Your place, on the map" hero
- 4 benefit cards (accuracy, reach, trails, Producer Picks)
- 3-step how-it-works
- Feature checklist with analytics, dashboard, direct links
- "Claiming is free. Always." pricing transparency
- Live stats from Supabase
- Honest, direct voice — not salesy

---

## Phase 5: Platform Hardening

### Error Boundaries
Five error boundaries with consistent design and auto-reporting:
- `app/error.js` — Root boundary
- `app/search/error.js` — Search-specific with "Browse the map" fallback
- `app/regions/error.js` — Regions boundary
- `app/itinerary/error.js` — Itinerary boundary (rewrote existing)
- `app/not-found.js` — Updated 404 with better copy and links

All boundaries: report to `/api/client-error` on mount, dev-only error details, retry + navigation fallbacks.

### Performance
Fixed `select('*')` in 7 highest-traffic public API routes:
- `app/api/trails/[id]/route.js` — 4 queries narrowed
- `app/api/trails/route.js` — Post-insert select narrowed
- `app/api/dashboard/picks/route.js` — 6 columns instead of *
- `app/api/dashboard/network/route.js` — 2 queries narrowed
- `app/api/operators/data/route.js` — 4 queries narrowed + 3 sequential queries parallelized with Promise.all
- `app/api/auth/promote-role/route.js` — 2 queries narrowed
- `app/t/[shortcode]/route.js` — 2 queries narrowed

### Global Error Monitoring
- `GlobalErrorReporter` component attached to root layout
- Catches unhandled promise rejections and uncaught errors
- Silent fire-and-forget reporting to `client_errors` table

---

## Phase 6: SEO & Distribution

### Dynamic OG Images
`app/og/[slug]/route.js`

Generates 1200x630 PNG images per listing using `ImageResponse`:
- Cream background with "Australian Atlas" wordmark
- Listing name in serif font
- Vertical category badge with color coding
- Region + state
- Description preview
- Vertical accent bar
- 24-hour cache headers
- Fallback integrated into listing page `generateMetadata`

### Sitemap
`app/sitemap.js`

- Paginated fetch of all active listings (handles >1000)
- Static pages at priority 0.8-1.0
- Dynamic: `/place/{slug}` (0.7), `/regions/{slug}` (0.8), `/journal/{slug}` (0.6), `/trails/{slug}` (0.6)
- Uses `lastModified` from database
- Revalidates hourly

### Robots.txt
`app/robots.js`

Allows all bots, disallows `/admin/`, `/api/`, `/dashboard/`, `/vendor/`, `/account/`. References sitemap.

### JSON-LD Enhancements
- Opening hours specification added to listing schema
- Breadcrumb links now all resolve to real URLs
- ItemList schema on collection detail pages

---

## Phase 7: Visionary Features

### Wish List / Suggest a Place
- `app/suggest/page.js` — Public submission page
- `app/suggest/SuggestForm.js` — Client form with 7 fields
- Enhanced `app/api/suggest/route.js` — Accepts submitter name/email, why_listed
- Added to footer

### Independence Pledge
`app/independence/page.js`

A values page explaining what "independent" means:
- The pledge statement
- 4 independence criteria
- Why it matters (3 editorial paragraphs)
- How we verify (4 steps)
- CTA to suggest a place
- Breadcrumb JSON-LD

---

## Phase 8: Human Things

### About Page Rewrite
`app/about/page.js` — Complete editorial rewrite

- Story-driven narrative about mapping independent Australia
- "What we believe" — 4 belief cards
- "Nine atlases, one Australia" — all verticals with editorial descriptions
- "Three audiences" — travellers, operators, councils
- Community CTA linking to /suggest
- Organization JSON-LD
- Live stats woven into prose

### Admin: Duplicates Review
- `app/admin/duplicates/page.js` — Server page with summary counts
- `app/admin/duplicates/DuplicatesTable.js` — Side-by-side comparison with merge/dismiss actions
- `app/api/admin/duplicates/route.js` — GET + POST handlers for merge and dismiss workflows
- Color-coded confidence and match-reason badges
- Click-to-select which listing to keep

---

## Itinerary Fixes (Pre-Sprint)

- **Map zoom**: Bounds-based initialization instead of center/zoom:10 pop
- **Category keywords**: Removed generic 'shop'/'shops' from corner, added multi-word field terms
- **Day numbering**: Backend renumbering after filter + frontend index-based rendering
- **Add to trail**: Full state management — adds stop to last day, removes from recommendations, triggers map update

---

## Files Created (New)

| File | Purpose |
|------|---------|
| `supabase/migrations/061_sprint_infrastructure.sql` | Comprehensive schema migration |
| `supabase/migrations/062_duplicate_merge_support.sql` | Merge support |
| `scripts/calculate-quality-scores.mjs` | Quality scoring |
| `scripts/parse-addresses.mjs` | Address parsing |
| `scripts/check-url-staleness.mjs` | URL health checks |
| `scripts/detect-duplicates.mjs` | Duplicate detection |
| `scripts/seed-collections.mjs` | Collection seeding |
| `app/api/autocomplete/route.js` | Autocomplete API |
| `app/api/community-report/route.js` | Community reports API |
| `app/api/client-error/route.js` | Client error logging API |
| `app/api/admin/duplicates/route.js` | Admin duplicates API |
| `app/og/[slug]/route.js` | Dynamic OG images |
| `app/collections/page.js` | Collections index |
| `app/collections/[slug]/page.js` | Collection detail |
| `app/atlas-index/page.js` | A-Z directory |
| `app/suggest/page.js` | Suggest a place |
| `app/suggest/SuggestForm.js` | Suggestion form |
| `app/independence/page.js` | Independence pledge |
| `app/error.js` | Root error boundary |
| `app/search/error.js` | Search error boundary |
| `app/regions/error.js` | Regions error boundary |
| `app/sitemap.js` | Dynamic sitemap |
| `app/robots.js` | Robots.txt |
| `app/admin/duplicates/page.js` | Admin duplicates page |
| `app/admin/duplicates/DuplicatesTable.js` | Duplicates UI |
| `components/SearchAutocomplete.js` | Autocomplete dropdown |
| `components/ReportIssueModal.js` | Report issue modal |
| `components/ReportIssueButton.js` | Report issue button |
| `components/OpeningHours.js` | Hours display |
| `components/ClientErrorBoundary.js` | Error boundary component |
| `components/GlobalErrorReporter.js` | Global error catching |
| `lib/reportClientError.js` | Error reporting utility |

## Files Modified

| File | Changes |
|------|---------|
| `app/api/search/route.js` | Complete search rebuild |
| `app/search/page.js` | Autocomplete integration, auto-state detection |
| `app/place/[slug]/page.js` | Internal linking, hours, report button, OG fallback, breadcrumb links |
| `app/about/page.js` | Complete editorial rewrite |
| `app/operators/page.js` | Complete rewrite for venue operators |
| `app/itinerary/page.js` | Day numbering fix, add-to-trail |
| `app/itinerary/TrailMap.js` | Bounds-based initialization |
| `app/api/itinerary/route.js` | Category keywords fix, day renumbering |
| `app/not-found.js` | Updated design and copy |
| `app/itinerary/error.js` | Rewritten with error reporting |
| `app/layout.js` | GlobalErrorReporter integration |
| `app/api/suggest/route.js` | Extended fields |
| `lib/jsonLd.js` | Opening hours specification |
| `components/Nav.js` | Collections + Index links |
| `components/HomeSearchBar.js` | Autocomplete integration |
| `components/Footer.js` | Suggest a Place link |
| `app/api/trails/[id]/route.js` | select('*') → specific columns |
| `app/api/trails/route.js` | select() → specific columns |
| `app/api/dashboard/picks/route.js` | select('*') → specific columns |
| `app/api/dashboard/network/route.js` | select('*') → specific columns |
| `app/api/operators/data/route.js` | select('*') → specific columns + parallelization |
| `app/api/auth/promote-role/route.js` | select('*') → specific columns |
| `app/t/[shortcode]/page.js` | select('*') → specific columns |
| `app/api/user/saves/route.js` | JWT verification security fix |
| `app/api/user/visits/route.js` | JWT verification security fix |
| `app/globals.css` | Autocomplete spinner animation |

---

## Audit Findings (Requires Attention)

### Critical: Missing Environment Secrets

Three auth secrets are **not set** and should be added to Vercel immediately:

| Secret | Impact if missing |
|--------|-------------------|
| `SHARED_AUTH_SECRET` | Cross-vertical JWT falls back to `ADMIN_PASSWORD` (security anti-pattern) |
| `SHARED_API_SECRET` | `/api/auth/promote-role` can't authenticate vertical callbacks |
| `COUNCIL_SESSION_SECRET` | Council login will crash (`lib/council-session.js` throws) |

Also: `CRON_SECRET` is still the placeholder `"atlas-sync-secret-change-me"` — should be rotated.

### Security: JWT Verification (Fixed)

`/api/user/saves` and `/api/user/visits` were parsing JWTs with `atob(token.split('.')[1])` — no signature verification. **Fixed** to use `verifySharedToken()` with HS256 verification.

### Security: Admin Auth

`/api/admin-auth` compares passwords in plaintext. Recommend migrating to bcrypt hash comparison.

### Performance: O(n) Dashboard Queries

`/api/dashboard` makes 3 sequential DB queries **per listing** in a loop. Should batch with IN operator.

### Disabled Features

- `components/ProducerPicks.js` — returns `null`, waiting for `producer_picks` table on master portal
- Dashboard vendor lookup uses email-based filtering (workaround until `vendor_user_id` FK added)

### Component Audit

**73 pages, 28 reusable components** across the portal.

**9 unused components** (in-progress or deferred features):
- `CrossVerticalNearby.js` — cross-vertical recommendations (prepared, not connected)
- `GeoSeoExplainer.js` — SEO education block
- `HomeMapBackground.js` — replaced by `HomeMapSection`
- `MapCountRotator.js` — superseded by simpler stats
- `ProducerPicks.js` — stubbed, awaiting schema
- `RegionalBacklink.js` — breadcrumb variant
- `TrailLoadingOverlay.js` — functional but unconnected
- `WhatsNearby.js` + `WhatsNearbyStandalone.js` — nearby widgets

**Vertical config duplication**: `VERTICAL_TOKENS`, `VERTICAL_STYLES`, `VERTICAL_CARD_COLORS` are defined in 3+ files. Should consolidate to a single `lib/verticals.js`.

**Zero test coverage**: No jest/vitest, no eslint/prettier. Recommend adding in next session.

### Vertical Repos Audit

All **9 vertical repos** audited. Auth patterns, shared components, and Supabase connections are consistent across the network.

**4 verticals missing git remotes** (committed locally only):
- Field Atlas, Corner Atlas, Found Atlas, Table Atlas

**3 verticals still have emoji Unicode definitions** that should be removed:
- **Field Atlas** — `TYPE_ICONS` in `lib/constants.js` (9 emoji definitions, used in 2 pages)
- **Corner Atlas** — `CATEGORY_ICONS` in `lib/constants.js` (5 emoji definitions, used in trail builder)
- **Table Atlas** — `CATEGORY_ICONS` in `lib/constants.js` (5 emoji definitions, used in category pages)

### Database Schema Audit (60 migrations, 40+ tables)

**Orphaned tables to drop:**
- `vendor_accounts` — deprecated in migration 053, fully replaced by `profiles` with role='vendor'
- `site_analytics` — superseded by simpler `pageviews` table in migration 015

**Semantic overlap:**
- `hidden_reason` column + `status='hidden'` both track hiding with unclear precedence. Needs documented convention.
- `editors_pick` + `is_featured` have no mutual exclusivity constraint — listings can have both, creating UI ambiguity.

**Missing indexes:**
- `listings.data_source` — no index; filtering AI-generated content requires full table scan
- `listings.needs_review` — partial index only for `true`; querying `false` scans entire table

**Unpopulated denormalization:**
- `analytics_daily_summary` table exists but no cron/trigger populates it. Dashboard queries raw tables.

**API rate limiting weakness:**
- `api_keys.requests_today` incremented by application logic, not transactional. Concurrent requests can bypass limits.

**Duplicate migration number:**
- `028_candidate_unique.sql` and `028_editorial_pitches.sql` share the same number.

**Embedding dimensions:**
- Successfully migrated 1536→1024 (Voyage-3) in migration 049. All RPC functions updated. No issues.

**JSONB validation:**
- `staleness_flags`, `producer_picks`, `trail_data`, `operator_trails.trail_data` all lack schema constraints.

### Error Boundary Coverage (Post-Sprint)

Before sprint: 2 error boundaries (`/admin`, `/place/[slug]`)
After sprint: **7 boundaries** (`/` root, `/search`, `/regions`, `/itinerary`, `/place/[slug]`, `/admin`)
Still missing: `/council`, `/operators`, `/dashboard`, `/trails`, `/events`

---

## What's Next

The foundation is dramatically stronger. Priority items for the next session:

1. **Run migrations** 061 + 062 against production Supabase
2. **Run scripts**: quality scores, address parsing, URL staleness, duplicate detection
3. **Seed collections** with real data
4. **Test autocomplete** end-to-end
5. **Fix remaining select('*')** in admin routes (37+ instances identified)
6. **Deploy** and verify OG images, sitemap, error boundaries
7. **Phase 3 remainders**: For You feed, serendipity engine, place memories, trail save/export
8. **Phase 4 remainders**: Hours editor (write mode), outreach queue, Stripe audit
9. **Phase 7 remainders**: Atlas Report, public API, PWA, accessibility audit

---

*Built in one overnight sprint. April 2026.*
