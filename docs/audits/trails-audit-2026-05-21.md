# Trail Infrastructure Audit — 2026-05-21

## Executive summary

Trails exist across three separate systems that share no code: the **manual trail builder** (`/trails/builder`), the **AI road-trip planner** (`/on-this-road`), and the **editorial pitch pipeline** (`/admin/trails`). The manual builder and editorial pipeline write to the same `trails` + `trail_stops` tables and render on the same reader pages (`/trails/[slug]`, `/t/[shortcode]`). The road-trip planner writes to a completely separate `road_trips` table and renders at `/trip/[slug]`. No RLS policies exist on any trail table — all access control is enforced at the API layer. The editorial workflow (pitch → draft → in_review → published → archived) is well-structured and functional. Cross-system integration is thin: trails appear in the nav and account pages but are absent from the map, journal, collections, and listing detail pages.

---

## 1. Schema layer

### 1.1 `trails` table — columns (after all migrations applied)

The table was created in migration 016 and extended by migrations 079, 080, and 104.

| Column | Type | Constraints / Default | Notes |
|--------|------|----------------------|-------|
| `id` | uuid | PK, `gen_random_uuid()` | |
| `slug` | text | UNIQUE NOT NULL | URL identifier |
| `title` | text | NOT NULL | |
| `description` | text | nullable | |
| `type` | text | NOT NULL, default `'user'`, CHECK `('editorial','user')` | |
| `visibility` | text | NOT NULL, default `'private'`, CHECK `('private','link','public')` | |
| `created_by` | uuid | FK → `auth.users(id)` ON DELETE SET NULL | |
| `hero_image_url` | text | nullable | Renamed from `cover_image_url` in migration 104 |
| `hero_intro` | text | nullable | |
| `region` | text | nullable | Free-text; kept alongside `region_id` |
| `vertical_focus` | text | nullable | |
| `stop_count` | integer | default 0 | Denormalized |
| `short_code` | text | UNIQUE, nullable | 8-char random code for `/t/[shortcode]` |
| `published` | boolean | default false | Legacy; editorial trails now use `status` |
| `duration_hours` | text | nullable | Stored as text, not numeric |
| `best_season` | text | nullable | |
| `curator_name` | text | nullable | |
| `curator_note` | text | nullable | |
| `created_at` | timestamptz | default `now()` | |
| `updated_at` | timestamptz | default `now()` | Auto-updated via trigger |
| `saved_via` | text | nullable | Migration 079. Values: `'explicit'`, `'share'` |
| `transport_mode` | text | NOT NULL, default `'drive'`, CHECK `('drive','transit','neighbourhood')` | Migration 080 |
| `neighbourhood_label` | text | nullable | Migration 080 |
| `getting_there_origin` | jsonb | nullable | Migration 080 |
| `subtitle` | text | nullable | Migration 104 |
| `intro` | text | nullable | Migration 104. Backfilled from `hero_intro`/`description` |
| `outro` | text | nullable | Migration 104 |
| `hero_image_alt` | text | nullable | Migration 104 |
| `hero_image_credit` | text | nullable | Migration 104 |
| `region_id` | uuid | FK → `regions(id)`, nullable | Migration 104 |
| `secondary_region_ids` | uuid[] | default `'{}'` | Migration 104 |
| `total_distance_km` | numeric(8,2) | nullable | Migration 104 |
| `total_duration_minutes` | integer | nullable | Migration 104 |
| `day_count` | integer | CHECK 1–7 or NULL | Migration 104 |
| `season_window` | text | nullable | Migration 104 |
| `mood_tags` | text[] | default `'{}'` | Migration 104 |
| `vertical_mix` | text[] | default `'{}'` | Migration 104 |
| `author_id` | uuid | FK → `auth.users(id)` ON DELETE SET NULL | Migration 104 |
| `editor_id` | uuid | FK → `auth.users(id)` ON DELETE SET NULL | Migration 104 |
| `status` | text | CHECK `('pitch','draft','in_review','published','archived')` or NULL | Migration 104. NULL for legacy user trails |
| `published_at` | timestamptz | nullable | Migration 104 |
| `last_edited_at` | timestamptz | nullable | Migration 104 |
| `thesis` | text | nullable | Migration 104 |
| `og_title` | text | nullable | Migration 104 |
| `og_description` | text | nullable | Migration 104 |
| `meta_description` | text | nullable | Migration 104 |
| `partner_org_id` | uuid | nullable, no FK yet | Migration 104, Phase 2 prep |
| `partner_credit_line` | text | nullable | Migration 104, Phase 2 prep |

### 1.2 `trail_stops` table — columns

Created in migration 016, extended by migrations 079 and 104.

| Column | Type | Constraints / Default | Notes |
|--------|------|----------------------|-------|
| `id` | uuid | PK, `gen_random_uuid()` | |
| `trail_id` | uuid | NOT NULL, FK → `trails(id)` ON DELETE CASCADE | |
| `listing_id` | uuid | FK → `listings(id)` ON DELETE SET NULL | |
| `vertical` | text | NOT NULL | |
| `venue_name` | text | NOT NULL | Denormalized |
| `venue_lat` | double precision | nullable | Denormalized |
| `venue_lng` | double precision | nullable | Denormalized |
| `venue_image_url` | text | nullable | Denormalized |
| `position` | integer | NOT NULL, default 0 | Renamed from `order_index` in migration 104 |
| `editorial_copy` | text | nullable | Renamed from `notes` in migration 104 |
| `created_at` | timestamptz | default `now()` | |
| `included_in_route` | boolean | NOT NULL, default true | Migration 079 |
| `arrival_note` | text | nullable | Migration 104 |
| `day_number` | integer | nullable | Migration 104 |
| `is_overnight` | boolean | default false | Migration 104 |
| `distance_from_previous_km` | numeric(8,2) | nullable | Migration 104 |
| `duration_from_previous_minutes` | integer | nullable | Migration 104 |

### 1.3 Indexes

| Index | Table | Columns | Notes |
|-------|-------|---------|-------|
| `trails_slug_idx` | trails | slug | |
| `trails_short_code_idx` | trails | short_code | |
| `trails_created_by_idx` | trails | created_by | |
| `trails_type_vis_idx` | trails | type, visibility | |
| `trail_stops_position_idx` | trail_stops | trail_id, position | Replaced `trail_stops_order_idx` |
| `trail_stops_day_idx` | trail_stops | trail_id, day_number | Migration 104 |
| `trails_status_idx` | trails | status (WHERE NOT NULL) | Migration 104 |
| `trails_region_id_idx` | trails | region_id (WHERE NOT NULL) | Migration 104 |
| `trails_author_id_idx` | trails | author_id (WHERE NOT NULL) | Migration 104 |
| `trails_published_at_idx` | trails | published_at DESC (WHERE status='published') | Migration 104 |

### 1.4 Foreign key relationships

- `trails.created_by` → `auth.users(id)` ON DELETE SET NULL
- `trails.region_id` → `regions(id)` (no ON DELETE specified — defaults to RESTRICT)
- `trails.author_id` → `auth.users(id)` ON DELETE SET NULL
- `trails.editor_id` → `auth.users(id)` ON DELETE SET NULL
- `trail_stops.trail_id` → `trails(id)` ON DELETE CASCADE
- `trail_stops.listing_id` → `listings(id)` ON DELETE SET NULL

### 1.5 Schema vs CLAUDE.md discrepancies

CLAUDE.md serves as the technical architecture reference (no separate `06-technical-architecture.md` file exists). Discrepancies:

| Claim in CLAUDE.md | Actual state |
|--------------------|--------------|
| `cover_image_url` column | Renamed to `hero_image_url` in migration 104 |
| `order_index` on trail_stops | Renamed to `position` in migration 104 |
| `notes` on trail_stops | Renamed to `editorial_copy` in migration 104 |
| Embeddings: "1536-dim vectors" | Corrected to 1024-dim (Voyage-3) in migration 049 |
| `/trails/builder` listed as a page | Exists and functions |
| `short_code`: "8-char random code" | Confirmed: generated on creation |

CLAUDE.md references `cover_image_url`, `order_index`, and `notes` — all three have been renamed. The CLAUDE.md trails section is stale relative to migration 104.

### 1.6 Row counts and data distribution

Row counts cannot be queried directly from the codebase (requires database access). The following is inferred from code behaviour:

- The `trails` index page (`/trails/page.js`) queries editorial trails where `published=true` and user trails where `visibility='public'`. If these return empty arrays, the page renders "Editorial trails coming soon" and omits the community section entirely.
- The seed script (`scripts/seed-editorial-trails.mjs`) creates two editorial trails with real venue data: `melbourne-yarra-valley-independent-scene` and `barossa-adelaide-hills-artisan-corridor`.
- The Phase 1.1 backlog notes these seeded trails lack `cover_image_url` (now `hero_image_url`), so they degrade gracefully to a typographic hero.
- `user_trails` table (separate from `trails`) is reported to have 0 rows — all cached itinerary responses have expired.

### 1.7 Related tables

| Table | Created in | Purpose |
|-------|-----------|---------|
| `trail_pitches` | Migration 104 | Editorial pitch workflow — stores thesis, region, vertical weights, candidate results |
| `trail_revisions` | Migration 104 | Snapshot audit trail — full JSON snapshot of trail + stops at each save |
| `trail_errors` | Migration 058 | Error log for trail builder API failures |
| `user_trails` | Migration 025, modified 049 | Cached AI-generated itinerary responses (not editorial trails) |
| `road_trips` | Migration 075 | On-This-Road saved trips — separate from `trails` table entirely |

### 1.8 Orphaned trail_stops

Cannot be determined without database access. The schema defines `listing_id FK → listings(id) ON DELETE SET NULL`, so if a listing is deleted, the `trail_stop.listing_id` becomes NULL rather than the row being deleted. Code handles this: `stop.listings?.slug || null` in the reader, falling back to a non-linked venue name.

---

## 2. Builder layer

There are **three distinct builder surfaces**, each with independent codebases:

### 2.1 Manual trail builder (`/trails/builder`)

**Route structure:**
- `app/trails/builder/page.js` — client component (`'use client'`)
- Wrapped in `<Suspense>` for `useSearchParams`
- Imports: `mapbox-gl`, `@/lib/supabase/auth-clients`, `@/lib/verticalUrl`, `@/components/TrailLegCard`, `@/components/GettingThereCard`

**Data flow:**
1. User searches for venues via text input → `GET /api/trails/search?q=...&vertical=...`
2. Search API queries `listings` table: `name ilike '%q%'`, filtered by `status='active'`, optional vertical filter, returns id/name/vertical/region/lat/lng/slug
3. User adds stops to local state array (`useState`)
4. On save → `POST /api/trails` with `{ title, description, type:'user', visibility, transport_mode, stops[] }`
5. API generates slug + short_code, inserts trail + trail_stops, returns trail object
6. Client redirects to `/trails/${slug}`

**Auth requirement:** Supabase session required to save. Unauthenticated users see a "Sign in to save" prompt. Share saves (`saved_via='share'`) allow anonymous creation.

**Map integration:** Mapbox GL JS with dark cartographic style. Renders stop markers (numbered, colour-coded by vertical) and driving routes between consecutive stops via Mapbox Directions API. Route requests are per-leg (stop N to stop N+1). Falls back to straight lines on Directions API failure.

**Identified issues:**
- `editId = searchParams.get('id')` is read but never used — edit mode is wired in the URL param but not implemented. Loading an existing trail for editing does not work.
- Transport mode selector has "Drive" and "No Car" buttons, but "No Car" expands to "Transit + Walking" and "Neighbourhood Walk" sub-modes. The `transit` mode uses `walking` profile for Mapbox Directions (line 141), which may produce incorrect route distances for mixed transit trips.
- The `window.__trailBuilderAdd` / `window.__trailBuilderRemove` pattern (lines 77–88) attaches global functions for popup buttons — a code smell but functional.
- No drag-and-drop reordering — only up/down arrow buttons.

**Last meaningful commit:** Cannot determine exact date without running git log, but the builder code references `TrailLegCard` and `GettingThereCard` components added during the neighbourhood walk feature (migration 080).

**TODO/FIXME comments:** None found in trail builder files.

**Site links to builder:** Linked from `/trails` page ("Or build manually →"), from trail detail pages ("Build a trail" CTA), and from shared trail pages. Not linked from homepage or main navigation directly — discoverable only from the trails section.

### 2.2 AI road-trip planner (`/on-this-road`)

**Route structure:**
- `app/on-this-road/page.js` — server component (metadata only)
- `app/on-this-road/OnThisRoadClient.js` — full client component (1147 lines)
- `app/on-this-road/RouteMap.js` — Mapbox GL map for route rendering
- `app/on-this-road/on-this-road.css` — styles

**Data flow:**
1. User fills form: start/end locations, trip length, preferences, transport mode, detour tolerance
2. Client `POST /api/on-this-road` with form data
3. API route (`maxDuration=120s`):
   - Geocodes start/end via Mapbox
   - Gets driving route via Mapbox Directions
   - Queries listings within a buffer zone around the route
   - Calls Anthropic Claude (`claude-sonnet-4-6`) to select and sequence stops
   - Returns structured JSON with stops, route geometry, days, coverage gaps
4. Client renders results: title, stops, map, days (if multi-day), overnight accommodation
5. Save: `POST /api/on-this-road/save` → inserts into `road_trips` table (NOT `trails`)

**Key distinction:** On-this-road does NOT create `trails` table records. Saved trips go to `road_trips` and render at `/trip/[slug]`. The two trail systems are completely separate.

**Identified issues:**
- The `maxDuration=120` (2 minutes) timeout is generous but the Claude API call can still time out on complex multi-day routes, producing the error "The route is taking longer than expected to plan."
- Surprise mode generates a random direction and builds a loop — functional but the compass animation assumes `data.surprise_direction` is always present in surprise responses.
- Results reference `stop.hero_image_url` but render images only if `isApprovedImageSource()` returns true — stops without approved images show no image.
- The save endpoint generates a separate slug and short_code for `road_trips`, unrelated to the `trails` short_code system.

### 2.3 Editorial pitch pipeline (`/admin/trails`)

**Route structure:**
- `app/admin/trails/page.js` — dashboard with tabs: Pitches, Drafts, Published, Archived
- `app/admin/trails/pitch/new/page.js` — new pitch form
- `app/admin/trails/pitch/[id]/page.js` — pitch detail/edit
- `app/admin/trails/[id]/page.js` — trail editor (editorial)
- `app/admin/trails/[id]/preview/page.js` — preview

**Data flow:**
1. Admin creates pitch via `/admin/trails/pitch/new` → `POST /api/admin/trails/pitches`
2. Pitch stores thesis, region, vertical weights, day count, mood tags, must-include listings
3. Pitch can be regenerated (re-runs candidate scoring) or promoted to trail
4. Promotion: `POST /api/admin/trails/pitches/[id]/promote` → creates trail record with `status='draft'`, populates stops from candidates
5. Draft editing: `/admin/trails/[id]` → `PATCH /api/admin/trails/[id]`, `POST /api/admin/trails/[id]/stops`
6. State transitions: `POST /api/admin/trails/[id]/transitions` — moves through `draft → in_review → published → archived`. Each transition creates a `trail_revisions` snapshot.

**Identified issues:**
- The pitch scoring system (`lib/trails/scoring.js`) uses Voyage-3 embeddings (1024-dim) to rank candidate listings against the trail thesis. However, the CLAUDE.md still references 1536-dim embeddings.
- Stops added via the admin API auto-compute distances from previous stop using Mapbox Directions and recompute trail totals (`lib/trails/totals.js`).

---

## 3. Reader layer

### 3.1 Trail discovery index (`/trails`)

**File:** `app/trails/page.js` (server component, SSR, 1-hour revalidation)

**What it shows:**
- Hero section with `TrailPromptInput` component (links to AI itinerary builder at `/itinerary`)
- "Try Something Like" grid — 6 hardcoded example queries linking to `/itinerary?q=...`
- Editorial Trails section — queries `trails` where `type='editorial' AND published=true`
- Community Trails section — queries `trails` where `type='user' AND visibility='public'`, limit 12
- "How It Works" section explaining the AI builder

**Rendering:** Editorial trails show as large cards with typographic hero (dot-grid pattern + title). Community trails show as small cards with title, stop count, region, vertical badge. Links use slug for editorial (`/trails/[slug]`) and short_code for community (`/t/[shortcode]`).

**Status:** Renders correctly. If no editorial trails are published, shows "Editorial trails coming soon." Community section omitted if empty.

### 3.2 Trail detail page (`/trails/[slug]`)

**File:** `app/trails/[slug]/page.js` (server component, 1-hour revalidation)

**What it shows:**
- Dark hero with title, description, stop count, transport mode, curator info
- Editorial intro prose (if `type='editorial'` and `hero_intro` exists)
- Two-column layout: stops list (left) + sticky interactive map (right)
- Each stop: numbered badge (colour by vertical), venue image or typographic placeholder, name linked to `/place/[slug]`, editorial copy, "View listing" link
- Walking leg cards between stops for non-drive transport modes
- "Getting There" card for neighbourhood trails
- "Plan your visit" section with duration, season, region, stop count
- Share button + navigation to all trails and builder

**Data fetching:** Queries `trails` by slug where `published=true`, then `trail_stops` joined with `listings(slug)` ordered by `position`. Calls `notFound()` if trail doesn't exist or isn't published.

**Identified issue:** The query filters on `published=true` only — it does NOT check `visibility`. A user trail with `published=false` but `visibility='public'` won't render. Conversely, the `visibility` field is not checked at all on this page — if `published=true`, the trail is visible regardless of visibility setting. This is a discrepancy: the API route at `GET /api/trails` does filter by visibility, but the SSR page does not.

### 3.3 Shared trail page (`/t/[shortcode]`)

**File:** `app/t/[shortcode]/page.js` (server component, `force-dynamic`)

**What it shows:** Same two-column layout as trail detail. Queries by `short_code` where `visibility IN ('link', 'public')`. Does NOT check `published` field — any trail with a short_code and `visibility='link'` or `'public'` will render, even if `published=false`.

**Status:** Functional. Correctly gates on visibility for shared URLs.

### 3.4 Map view of trails

**Status: Non-existent.** The portal map (`/map`) renders individual listing markers only. No trail routes or trail stop overlays. The trail detail page has its own embedded `TrailInteractive` / `TrailMap` component, but this is per-trail, not a global trail map.

### 3.5 Listing backlinks to trails

**Status: Non-existent.** The listing detail page (`/place/[slug]`) does not query `trail_stops` to show which trails include this listing. No "Appears in trails" section exists.

---

## 4. Cross-system touchpoints

### 4.1 Long weekend engine

**Status: Non-existent.** No `/long-weekend` route exists. The itinerary builder at `/itinerary` is a general multi-day trip planner, not specific to long weekends. The `/plan` route is a chat-based two-stage itinerary generator (Haiku → Sonnet) — separate from both `/itinerary` and `/on-this-road`.

### 4.2 Collections

**Status: No connection.** Collections (`/collections/[slug]`) are static curated listing sets stored with `listing_ids`. No schema or code relationship with trails. Completely independent content systems.

### 4.3 Journal articles

**Status: No connection.** Articles have `region_tags` and `listing_tags` but no trail references. No article → trail or trail → article linking exists.

### 4.4 Region pages (`/regions/[slug]`)

**Status: Partial, one-way.** Region detail pages render a `RegionTrailCTA` component — a button reading "Planning a trip to [region]?" that navigates to `/itinerary?q=Explore+{region}`. This links to the AI itinerary builder, not to existing editorial trails for the region. Existing trails are not listed on region pages.

### 4.5 Portal map (`/map`)

**Status: No connection.** The map renders listing markers only, filtered by vertical and state. No trail routes, trail stop overlays, or trail discovery. Trails are completely absent from the map.

### 4.6 Account trails page (`/account/trails`)

**Status: Working.** Displays the authenticated user's trails via `GET /api/trails?created_by={user.id}`. Shows title, stop count, region, created date, visibility badge. Provides view, edit (links to `/trails/builder`), share, and delete actions.

### 4.7 Operators trails page (`/operators/trails`)

**Status: Working.** Displays operator-managed trails. Fetches via `GET /api/operators/data?view=trails`. Provides share, export PDF, edit (links to `/itinerary?trail={id}`), and delete actions.

### 4.8 Favouriting / saving

**Status: Backend exists, no UI.** `user_saves` table and `/api/user/saves` GET/POST/DELETE endpoints exist for listing favouriting. However, no heart buttons or save affordances are rendered anywhere on trail pages. The trail-trip-favourites audit (2026-04-25) confirmed this gap.

---

## 5. Auth and permissions

### 5.1 Trail creation

| Who | Mechanism | Details |
|-----|-----------|---------|
| Authenticated user | `POST /api/trails` | Requires Supabase session. Creates `type='user'` trail |
| Anonymous (share) | `POST /api/trails` with `saved_via='share'` | Bypasses auth check. `created_by` is null |
| Admin | `POST /api/admin/trails/pitches/[id]/promote` | Creates `type='editorial'` trail from pitch |

### 5.2 Trail editing

- **Owner or admin:** `PUT /api/trails/[id]` checks `created_by === user.id` or `profile.role === 'admin'`
- **Admin only:** `PATCH /api/admin/trails/[id]` uses admin cookie auth (`checkAdmin()`)
- **Admin only:** State transitions via `POST /api/admin/trails/[id]/transitions`

### 5.3 Visibility enforcement

| Surface | Filter | Enforced? |
|---------|--------|-----------|
| `GET /api/trails` (public listing) | `type=editorial AND published=true` OR `type=user AND visibility=public` | Yes |
| `GET /api/trails?created_by=X` | Returns all user's trails regardless of visibility | Yes (appropriate) |
| `/trails/[slug]` SSR page | `published=true` only — does NOT check visibility | Partial — see discrepancy in §3.2 |
| `/t/[shortcode]` SSR page | `visibility IN ('link','public')` — does NOT check published | Partial — see discrepancy in §3.3 |
| `GET /api/trails/[id]` | No visibility or published check — returns any trail by id/slug | No enforcement |

### 5.4 Short code resolver

The resolver at `/t/[shortcode]` queries by `short_code` and gates on `visibility IN ('link','public')`. Short codes are populated on every trail creation (`POST /api/trails` generates an 8-char code; `POST /api/on-this-road/save` generates a separate code for `road_trips`). The road_trips short codes are not resolved by `/t/[shortcode]` — that route only queries the `trails` table.

### 5.5 RLS policies

**RLS is NOT enabled on `trails`, `trail_stops`, `trail_pitches`, `trail_revisions`, `trail_errors`, `user_trails`, or `road_trips`.** No migration enables RLS or creates policies for any trail-related table. All access control is enforced at the API layer via auth checks in route handlers. The service-role Supabase client (`getSupabaseAdmin()`) is used for all trail database operations, bypassing any RLS that might exist.

---

## 6. Observed failures

### F1: Edit mode not implemented in trail builder
- **Action:** Navigate to `/trails/builder?id={trailId}`
- **Failure mode:** Silent — `editId = searchParams.get('id')` is read but never used. The builder always starts empty. No existing trail data is loaded.
- **Console:** No errors
- **Network:** No fetch for the trail data

### F2: `/trails/[slug]` does not enforce visibility
- **Action:** Access a trail with `published=true` but `visibility='private'` via its slug
- **Failure mode:** Trail renders publicly despite being marked private
- **Root cause:** SSR page queries `published=true` only, not visibility

### F3: `/t/[shortcode]` does not enforce published state
- **Action:** Access an unpublished trail via its short code
- **Failure mode:** Trail renders despite `published=false`, as long as `visibility` is `'link'` or `'public'`
- **Root cause:** Shared trail page checks visibility but not published

### F4: `GET /api/trails/[id]` has no access control
- **Action:** Fetch any trail by UUID or slug via the API
- **Failure mode:** Returns full trail data including private trails
- **Root cause:** No auth check, no visibility filter, no published filter on single-trail endpoint

### F5: CLAUDE.md references stale column names
- **Failure mode:** Developers reading CLAUDE.md will use `cover_image_url`, `order_index`, and `notes` — all renamed in migration 104 to `hero_image_url`, `position`, and `editorial_copy` respectively
- **Impact:** Code written against CLAUDE.md will fail or target wrong columns

### F6: Transit mode uses walking profile for route distance
- **Action:** Build a trail with `transport_mode='transit'` in the builder
- **Failure mode:** Mapbox Directions is called with profile `walking` (line 141 of builder), producing walking-distance routes instead of transit routes. Distances shown are for pedestrians, not transit riders.
- **Root cause:** Mapbox Directions does not have a transit profile; code falls back to `walking` without noting the limitation

### F7: Duplicate trail data systems
- **Failure mode:** On-This-Road saves to `road_trips` table. Manual builder and editorial pipeline save to `trails` table. The two systems produce visually similar output but are stored in different tables, have different schemas, different short code resolvers, and render on different pages (`/trip/[slug]` vs `/trails/[slug]`).
- **Impact:** No unified trail inventory. A user who saves an On-This-Road trip cannot find it in their Account → Trails page (which queries the `trails` table only).

### F8: Four independent trip generators share no code
- **Failure mode:** `/api/itinerary`, `/api/day-trips`, `/api/on-this-road`, and the Phase 1 pitch tool each implement their own haversine, candidate filtering, day-grouping, and hallucination-stripping logic. Confirmed in the trail builder diagnostic (2026-04-29).
- **Impact:** Bugs fixed in one generator regress independently in others. Coordinate handling, vertical weighting, and distance budgets diverge.

### F9: Favouriting UI absent
- **Action:** Visit any trail page and look for a save/heart/favourite button
- **Failure mode:** No UI affordance exists despite the `user_saves` backend being functional
- **Confirmed by:** Trail-trip-favourites audit (2026-04-25)

---

## 7. Open questions

1. **Row counts unknown.** Exact counts of published editorial trails, user trails by visibility, trails with zero stops, and orphaned trail_stops cannot be determined from the codebase alone — requires direct database queries.

2. **`trail_type` column.** The migration 088 (`field_trails`) adds trail-specific columns to `field_meta` (distance, duration, difficulty, surface, elevation gain, bike type) — these are Field Atlas physical trail metadata, not the portal's Discovery Trail system. It's unclear whether the Field Atlas trail metadata is ever surfaced on the portal.

3. **Itinerary builder prompt.** The `/itinerary` route is referenced throughout but its API route was not in scope for this audit. It appears to be a separate system from both On-This-Road and the editorial pipeline, using a form-driven interface with `TrailPromptInput`.

4. **`user_trails` caching.** Migration 049 adds cache infrastructure to `user_trails` with a TTL cleanup index, but no cron job or scheduled cleanup was found. The table is reported to have 0 rows.

5. **RLS decision.** Was the absence of RLS on trail tables a deliberate design choice (relying on API-layer auth via service-role client) or an oversight? The `listings` table has RLS enabled (migration 008), but trails do not.

6. **Partner Phase 2 columns.** `partner_org_id` and `partner_credit_line` on trails, `submitted_by_partner_id` on pitches — all nullable with no FK target. These are documented as Phase 2 prep in migration 104 but it's unclear if Phase 2 is planned or parked.

7. **Scoring embeddings dimension.** `lib/trails/scoring.js` uses Voyage-3 embeddings. CLAUDE.md says 1536-dim; migration 049 corrected to 1024-dim. The scoring code should be checked against whichever dimension is actually deployed.
