# Trail/Trip-Builder & Favouriting Infrastructure Audit

**Date:** 2026-04-25
**Trigger:** Pre-scoping for the regional trip-builder v1 + favouriting infrastructure rebuild + tagging system.
**Status:** Read-only enumeration. No code changes.

## Executive summary

- **Trail/trip-builder: substantial existing infrastructure across THREE separate generation patterns.** Routes `/itinerary`, `/plan` (chat-based), and `/on-this-road` are three independently-implemented trip generators, all hitting Anthropic Claude. They share little code and produce different result shapes. v1 needs a strategic call: extend one of them or build a new fourth that supersedes/converges them.
- **Favouriting: backend exists, frontend UI does not exist.** The `user_saves` and `user_visits` tables ship in migration 025, the `/api/user/saves` route supports GET/POST/DELETE, and `/profile` reads them as a passport view. **Zero save/heart/bookmark buttons on listings, place pages, or cards.** v1 needs to add the UI affordance, not a new table.
- **Tagging: no formal tags table.** Categorisation is via `listings.sub_type` (text, primary subcategory) + `listings.sub_types` (text[], secondary). Preferences in `profiles.interests` JSONB (verticals/activities/regions/dietary). The proposed v1 dual-axis (subject + aspect) tagging is a genuinely new system.
- **AI integration: 3 prompt-engineering patterns to choose from.** `/api/itinerary` uses one structured-JSON pattern; `/api/plan` uses two-stage (Haiku intent extraction → Sonnet response) chat; `/api/on-this-road` uses a third route-aware variant. `/api/cron/*` agents add ~7 more agent prompt patterns.
- **User profile `interests`** already supports declared preferences (verticals, activities, regions, dietary). v1 personalisation can extend this rather than build new schema.

## 1. Trail/trip-builder current state

Three parallel generation paths. Each produces a trip plan but they have different inputs, outputs, persistence patterns, and conversational shapes.

### 1a. `/itinerary` — Form-driven structured trip planner

**Files:**
- [app/itinerary/page.js](australian-atlas/app/itinerary/page.js) (1,059 lines, client) — form UI + result render
- [app/api/itinerary/route.js](australian-atlas/app/api/itinerary/route.js) (2,090 lines, server) — generation
- [components/TrailQuestionFlow.js](australian-atlas/components/TrailQuestionFlow.js) — 5-question modal (accommodation, transport, group, pace, days)
- [./TrailMap.js](australian-atlas/app/itinerary/TrailMap.js) — Mapbox visualization

**Inputs (URL params + form):**
- `q` — natural-language query (e.g. "1 day in Elsternwick")
- `anchorId` — listing id to anchor as stop 1 of day 1
- `days` — duration
- `accommodation` — 'need' / 'sorted' / 'daytrip'
- `transport` — 'driving' / 'public' / 'walking'
- `group` — 'solo' / 'couple' / 'friends' / 'family'
- `pace` — 'relaxed' / 'balanced' / 'packed'
- `verticals[]` — preferred categories
- `attributes[]` — soft preferences (e.g. "wine_tasting", "swimming")

**Generation flow:**
1. Parse query for region anchors (CITY_TO_REGION mapping) → derive `geoBounds` (lat/lng bounding box)
2. If `anchorId`, fetch anchor listing, override geoBounds with 30km box around anchor
3. Fetch candidate listings via geo-bounded `baseQuery()` from listings table (filter: status=active, visitable, trail_suitable)
4. Optionally augment via Voyage-3 query embedding + pgvector cosine similarity
5. Sort candidates by claim status, editor's pick, quality score
6. Build candidate pool (max 50 venues), include anchor if present
7. Call Anthropic Claude Sonnet 4 with system prompt enforcing:
   - Use only candidate IDs (anti-hallucination)
   - Day sequencing rules (coffee morning, sba afternoon, rest evening)
   - Geographic clustering
   - Anchor must be stop[0] of day 1
   - Max 2 sba per day; rest only at end of day
8. Receive structured JSON: `{ title, intro, days: [{ day_number, label, stops: [...], overnight }] }`
9. Strip hallucinated stops (any listing_id not in candidates)
10. Enrich each stop with slug/source_id/region/hero_image_url from candidate match
11. Append "additional venues nearby" recommendations within RECOMMENDATION_RADIUS_KM

**Output:** Ephemeral — JSON returned to client, displayed live. No persistence in this route.

**User-facing affordances:**
- Day cards with stops + overnight
- Map of route
- "Try another direction" / regenerate button (form state preserves)
- Toggle stops in/out (client-side only)
- Save trip → calls `/api/trails` POST (creates row in `trails` table with `saved_via: 'itinerary'`)

### 1b. `/plan` — Chat-based concierge

**Files:**
- [app/plan/page.js](australian-atlas/app/plan/page.js) — entry
- [app/plan/PlanChat.js](australian-atlas/app/plan/PlanChat.js) — chat UI (client component)
- [app/api/plan/route.js](australian-atlas/app/api/plan/route.js) (305 lines) — two-stage generation
- [app/api/plan/save/route.js](australian-atlas/app/api/plan/save/route.js) — saves chat to `plan_conversations` table

**Generation flow:**
1. Stage 1: Haiku 4.5 intent extraction. Returns `{ intent, regions, verticals, duration_days, preferences, search_query, needs_venues }`
2. If `needs_venues`: parallel fetch
   - Voyage-3 embedding-based RPC `search_listings`
   - Region/vertical filtered text query supplement
   - Quality-fallback if both empty
3. Fetch matching collections for context
4. Stage 2: Sonnet response generation with system prompt + venue+collection context
5. Extract `mentionedVenues` for map pins (filter venues whose names appear in response)
6. Return `{ response, venues, intent }`

**Persistence:** `plan_conversations` table — full message history + venue ids + regions + session id. Sharable via `short_code` at `/plan/[code]`.

### 1c. `/on-this-road` — Road-trip planner

**Files:**
- [app/on-this-road/page.js](australian-atlas/app/on-this-road/page.js) — entry
- [app/on-this-road/OnThisRoadClient.js](australian-atlas/app/on-this-road/OnThisRoadClient.js) — form + result UI (client)
- [app/api/on-this-road/route.js](australian-atlas/app/api/on-this-road/route.js) (1,732 lines) — generation
- [app/api/on-this-road/save/route.js](australian-atlas/app/api/on-this-road/save/route.js) — saves to `road_trips` table
- [app/trip/[slug]/page.js](australian-atlas/app/trip/[slug]/page.js) — saved trip view

**Inputs:**
- `start_name`, `end_name` (or loop = same start/end)
- `start_coords`, `end_coords` (lat/lng)
- `trip_length` (single_day / overnight / weekend / week)
- `detour_tolerance` (none / small / generous)
- `departure_timing`
- `preferences` (mixed sba/coffee/field/etc selections)
- `is_surprise_me` boolean

**Generation flow:**
1. Mapbox Directions API for route geometry (start → end)
2. Walk route waypoints, find listings near each waypoint within distance budget (`getDistanceBudget` per `trip_length`)
3. Build night-cluster groupings (rest + dinner + coffee candidates per night)
4. Apply detour tolerance to filter
5. Call Anthropic with prompt building day-stops + overnight clusters along route
6. Enrich, strip hallucinations
7. Persist to `road_trips` table with full route geometry, days array, coverage gaps

**Storage:** `road_trips` table contains: slug, short_code, title, intro, start/end names + coords, route geometry (Mapbox-encoded), preferences, days[] JSONB, route_distance_km, route_duration_minutes, total_listings_found, coverage_gaps.

### 1d. `/trails` and `/trails/builder` — Editorial + manual trail builder

**Files:**
- [app/trails/page.js](australian-atlas/app/trails/page.js) — public trails index
- [app/trails/[slug]/page.js](australian-atlas/app/trails/[slug]/page.js) — saved trail detail
- [app/trails/builder/page.js](australian-atlas/app/trails/builder/page.js) (987 lines) — manual drag-add builder UI
- [app/api/trails/route.js](australian-atlas/app/api/trails/route.js) — list/create
- [app/api/trails/[id]/route.js](australian-atlas/app/api/trails/[id]/route.js) — read/update/delete
- [app/api/trails/search/route.js](australian-atlas/app/api/trails/search/route.js) — venue search for adding stops
- [app/t/[shortcode]/page.js](australian-atlas/app/t/[shortcode]/page.js) — share-link redirect

**Storage:** `trails` table (migration 016) + `trail_stops` table.

`trails` columns: id, slug, title, description, type ('editorial'|'user'), visibility ('private'|'link'|'public'), created_by, cover_image_url, hero_intro, region (text), vertical_focus, stop_count, short_code, published, duration_hours, best_season, curator_name, curator_note, transport_mode, neighbourhood_label, saved_via.

`trail_stops` columns: trail_id, listing_id (FK ON DELETE SET NULL), vertical, venue_name, venue_lat, venue_lng, venue_image_url, order_index, notes, included_in_route.

**Stops are denormalised** — venue name/lat/lng/image_url copied at save time. If listing later changes name/coords, the stop still shows the snapshot. (This is a design choice that v1 should evaluate — pros: trails survive listing deletes; cons: data drift.)

**Auth:** trails creation requires Supabase Auth user OR `saved_via: 'share'` for anonymous saves from share links.

### 1e. `/plan-my-stay` — Currently un-advertised

[app/plan-my-stay/page.js](australian-atlas/app/plan-my-stay/page.js) exists but is gated/un-advertised per earlier "retire and gate" decision. References Decision-1 region computation. Architecturally similar to `/plan` but stay-focused.

### 1f. Convergence concerns

The three live builders (`/itinerary`, `/plan`, `/on-this-road`) overlap heavily but don't share code:

| Concern | /itinerary | /plan | /on-this-road |
|---|---|---|---|
| Form-driven inputs | ✓ 5 questions | chat | ✓ trip-shape inputs |
| Conversational chat | ✗ | ✓ | ✗ |
| Persisted result | via `/api/trails` POST | `plan_conversations` | `road_trips` |
| Route geometry (Mapbox Directions) | ✗ | ✗ | ✓ |
| Anchor listing | ✓ | ✗ | ✗ (but uses start/end) |
| User preferences | partial | partial | partial |
| "Try another direction" affordance | client form re-submit | new chat turn | client form re-submit |

**v1 architectural call:** the regional trip-builder for v1 will be ANOTHER generator on top of these three, OR replace one of them. Recommend converging the form-driven generators (`/itinerary` + `/on-this-road`) into a shared `lib/trip-generation/` module with three preset entry points (anchor-based itinerary, route-based road trip, region-based v1 regional trip) all calling into the same Anthropic-prompt + candidate-fetch + hallucination-strip pipeline.

## 2. Favouriting current state

**Backend: complete.**
- [supabase/migrations/025_user_passport.sql](australian-atlas/supabase/migrations/025_user_passport.sql) — `user_saves` table (user_id, listing_id, saved_at, UNIQUE(user_id,listing_id)) + `user_visits` table (same shape, visited_at) + `user_trails` table.
- [app/api/user/saves/route.js](australian-atlas/app/api/user/saves/route.js) — GET (list saves with listing relation), POST (save), DELETE (unsave).
- [app/api/user/visits/route.js](australian-atlas/app/api/user/visits/route.js) — same shape for visits.

Both use shared-JWT auth via `verifySharedToken`.

**Frontend: zero UI.**
- No `SaveButton`, `HeartButton`, `BookmarkToggle` component exists in `components/`.
- Place page ([app/place/[slug]/page.js](australian-atlas/app/place/[slug]/page.js)) has no save affordance.
- ListingCard has no save toggle in any of its states.
- The only consumer of saves is [app/profile/page.js](australian-atlas/app/profile/page.js) which reads them as a "Wishlist" section (display only, no add/remove).

**Inheritance from SBA:** Per Matt's note, SBA had favouriting. There is no obvious SBA residue in the broader Atlas portal codebase — the user_saves table appears purpose-built. The original SBA favouriting was likely scoped to a single vertical's UI; the broader Atlas v1 build is genuinely from-scratch on the frontend.

**Recommendation:** v1 builds the UI affordance (heart icon on cards + place page). Backend is ready. Reuse existing `/api/user/saves` shape.

## 3. Tagging current state

**No formal tags table exists.** Categorisation lives in three separate places:

### 3a. `listings.sub_type` and `listings.sub_types`

Per migration 038 + 073:
- `sub_type` text (primary, single value, denormalised for index)
- `sub_types` text[] (primary + secondary, GIN indexed)
- Trigger keeps `sub_type = sub_types[1]`

Values are vertical-specific (per `CATEGORY_LABELS` in [components/ListingCard.js:23-46](australian-atlas/components/ListingCard.js#L23)):
- sba: winery, distillery, brewery, cidery, non_alcoholic, meadery, sake_brewery
- collection: archive, cultural_centre, gallery, botanical_garden, heritage_site, museum
- craft: ceramics_clay, visual_art, jewellery_metalwork, textile_fibre, wood_furniture, glass, printmaking
- fine_grounds: roaster, cafe
- rest: boutique_hotel, guesthouse, bnb, farm_stay, glamping, cottage
- field: swimming_hole, waterfall, lookout, gorge, coastal_walk, hot_spring, cave, national_park, wildlife_zoo, bush_walk, botanic_garden, nature_reserve
- corner: bookshop, record_store, homewares, clothing, gift_shop, general_store, stationery, art_supplies, lifestyle
- found: vintage_clothing, vintage_furniture, vintage_store, antiques, op_shop, books_ephemera, art_objects
- table: market, farm_gate, artisan_producer, specialty_retail, destination, restaurant

These are NOT dual-axis tags (subject vs aspect) — they're single-axis vertical-scoped subcategories.

### 3b. `profiles.interests` JSONB

Per [app/api/auth/preferences/route.js](australian-atlas/app/api/auth/preferences/route.js):
- `verticals: string[]` (subset of 9 verticals)
- `activities: string[]` (26 specific activities — wine_tasting, hiking, swimming, galleries, etc.)
- `regions: string[]` (state codes — VIC, NSW, etc.)
- `dietary: string[]` (vegetarian, vegan, gluten_free, dairy_free, no_preference)

This is the closest thing to a "soft preference" axis. Stored on profiles row, not on listings.

### 3c. Listing meta tables (per vertical)

Each vertical has a `<vertical>_meta` table (e.g. `craft_meta`, `sba_meta`) with vertical-specific fields. These hold richer category info but aren't queried for cross-vertical tag-matching.

**v1 dual-axis tagging (subject + aspect, 25-30 tags):** this is genuinely new schema. No existing pattern to extend cleanly. Build a new `listing_tags` table (listing_id, tag_id, axis text) + `tags` table (id, name, axis text, label).

**Migration consideration:** the 26 `activities` constants in `profiles.interests` overlap conceptually with the proposed v1 aspect tags. Recommend keeping `profiles.interests.activities` as the user-side preference vector (what users LIKE) and having the new `listing_tags` as the listing-side categorisation (what listings ARE), with a mapping or shared tag id space if convenient.

## 4. User/auth structure

Per [CLAUDE.md](australian-atlas/CLAUDE.md) Auth Architecture section:

- **Supabase Auth** — Google OAuth, email/password, magic-link OTP. Cookie-based sessions on `australianatlas.com.au`.
- **profiles table** — auto-created via trigger on signup. Roles: user, vendor, council, admin. Has `interests` JSONB (verticals/activities/regions/dietary).
- **Shared JWT (HS256, jose)** — cross-vertical SSO. 30-day expiry. Atlas signs token, verticals verify via `/api/auth/verify`.
- **Auth helpers:**
  - `lib/supabase/auth-clients.js` — browser/server Supabase clients
  - `lib/shared-auth.js` — shared JWT sign/verify (`verifySharedToken`)
  - `verifySharedToken(token)` is the standard pattern for API-route auth

**For v1 favouriting:** use the existing `verifySharedToken` pattern (cookie `atlas_auth_token`). Save/heart actions require a logged-in user; the existing user_saves API already enforces this.

**For v1 personalisation:** read `profiles.interests` for the user's declared interests; combine with `user_saves` (implicit signal) and `user_visits` (passport signal) to derive a preference vector.

## 5. Listings/regions data shape (post-Phase-2/3-step-1)

Per Phase 2 (`63929c4`) and Phase 3 step 1 Batches 1+2-finish (`841fd38`, `fda6466`):

- `listings.region_computed_id` (FK, populated by Phase 1.5 spatial trigger from polygon containment)
- `listings.region_override_id` (FK, admin-set via override mechanism, takes precedence)
- `listings.region` (legacy text, deprecated, kept until Phase 3 step 3)
- `regions` table: 53 live polygons covering metropolitan + tourism + wine regions

**Helper API (use this in v1):**
```js
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

// In selects:
.select(`id, name, ..., ${LISTING_REGION_SELECT}`)

// In display/filter:
const region = getListingRegion(listing) // → { id, slug, name, state } | null
```

**v1 trip-builder integration:** when surfacing trips on a region card, filter `listings WHERE region_computed_id = $regionId OR region_override_id = $regionId`. Helper handles the COALESCE precedence transparently in display reads.

## 6. AI/LLM integration patterns

All AI integration is via the official Anthropic SDK.

**Common pattern across all routes:**
```js
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const res = await client.messages.create({
  model: SONNET, // or HAIKU for intent extraction
  max_tokens: 1500,
  system: systemPrompt,
  messages: claudeMessages,
})
const text = res.content[0].text
```

**Three prompt-pattern shapes in trip generation:**

1. **Form-driven structured JSON** (`/api/itinerary`):
   - Single Sonnet call
   - System prompt: editorial voice + hard constraints + day sequencing rules + scheduling rules + geographic coherence + anchor instruction + accommodation/transport/group/pace conditional blocks + preference hierarchy (primary/secondary/soft) + "Respond with valid JSON only"
   - User prompt: "Build a N-day itinerary for: \"$query\"" + candidate venues JSON dump + exact response schema
   - 30s timeout, 1 retry on 529 or timeout
   - Parse: strip markdown fences, JSON.parse, hallucination-filter against candidate IDs

2. **Two-stage chat (Haiku → Sonnet)** (`/api/plan`):
   - Stage 1 (Haiku): intent extraction returning `{intent, regions, verticals, duration_days, preferences, search_query, needs_venues}`
   - Stage 2 (Sonnet): contextual response with venue+collection data appended to system prompt
   - Multi-turn (full message history passed)
   - Extract mentioned venues by string-match against candidate names

3. **Route-aware single-shot** (`/api/on-this-road`):
   - Mapbox Directions API → route geometry → walk waypoints → find listings near each → cluster by night
   - Single Sonnet call with cluster-aware prompt
   - Same hallucination strip pattern

**Cron-agent prompts** (Batch 5 territory but worth noting):
- 7+ cron routes use Claude for per-domain agents (enrichment, listing-velocity, revenue-signal, user-reactivation, backlink-builder, seo-content, editorial-signals)
- Each has its own prompt structure — none reused
- All use Sonnet, max 30-60s timeout

**Voyage AI embeddings** (in `/api/plan` and `/api/itinerary`):
- `voyage-3` model, 1536-dim
- Indexed via pgvector on `listings.embedding`
- Used for semantic candidate search (RPC `search_listings`)
- Optional — falls back to text/region/vertical filter if embedding unavailable

## 7. Existing patterns worth following

**For v1, build on:**

- **`lib/regions/getListingRegion.js` + `LISTING_REGION_SELECT`** — region access pattern, post-Phase-3-step-1.
- **`components/ListingCard.js` (default + `TypographicCard`)** — universal card. v1 venue cards in trip output should reuse this. Already migrated to use the helper.
- **Anthropic two-stage pattern (`/api/plan`)** — Haiku-for-intent, Sonnet-for-generation. Cheap intent classification + expensive generation only when needed. v1 personalisation can use the same shape — Haiku to classify "trip type" or "user mood", Sonnet for the actual narrative fill.
- **Hallucination-strip pattern** — every trip-generator strips response stops whose listing_id is not in the candidate pool. v1 should preserve this for any LLM-fill template.
- **Voyage embedding for semantic candidate search** — already integrated; v1 trip-builder should weight embedding similarity against user preferences.
- **`saved_via` column on trails** — explicit provenance tag. v1 trips can reuse this taxonomy ('itinerary', 'on_this_road', 'regional_v1', 'share', 'manual').
- **`profiles.interests` JSONB shape** — extend rather than replace. `interests.activities` already overlaps the proposed aspect tag axis.
- **Mapbox Directions for routing** — only `/on-this-road` uses it currently. v1 regional trips probably don't need Directions (no fixed start/end), just venue clustering.

**Patterns NOT to follow (known issues):**

- **`listings.region` text reads** — deprecated. Use the helper (post-Phase-3-step-1).
- **Manual slugification** — homepage hardcoded the brittle `name.toLowerCase().replace(/\s/g,'-')` until the Batch 1 cleanup. New code should pass slug explicitly.
- **`updateRegionCounts.js` ilike+alias** — being replaced in Batch 7. Don't extend it; v1 region listing counts should query `listings WHERE region_computed_id = $1 OR region_override_id = $1`.
- **Trail-stops denormalisation** — `trail_stops` snapshots venue data. v1 should re-evaluate whether trip output denormalises (resilient to listing deletes) or joins live (always-current). The current pattern does both — `trail_stops.listing_id` is the FK and venue_name/lat/lng are snapshots. Pick one.
- **Three parallel trip-generation routes that don't share code** — `/itinerary`, `/plan`, `/on-this-road` each rebuild candidate fetch, prompt construction, hallucination strip. v1 should refactor a shared `lib/trip-generation/` module before adding a fourth.

## 8. Recommendations for v1 architecture decisions

### Favourites table — extend or rebuild?

**Recommendation:** extend the existing `user_saves`. The schema is correct; only the UI is missing. The proposed v1 features (heart on cards, save toggle on place page) map 1:1 to the existing GET/POST/DELETE endpoints. No schema migration needed for v1 favouriting.

### Tagging — extend or rebuild?

**Recommendation:** rebuild. The proposed v1 dual-axis system (subject + aspect, 25-30 tags) doesn't map onto sub_type/sub_types (single-axis, vertical-scoped) or `profiles.interests.activities` (preference-side, not listing-side). New `tags` + `listing_tags` tables.

Consider:
- Whether the subject axis aligns with vertical (sba=drinks, table=food, etc.) — if yes, extend `vertical` rather than add new column
- Whether `profiles.interests.activities` and the v1 aspect tags share a vocabulary — if yes, single `tags` table referenced by both

### Trail-builder generation — follow which existing pattern?

**Recommendation:** follow the structured-JSON pattern from `/api/itinerary` for the regional v1 trip-builder. Reasons:
- Form-driven, not chat — matches "regional trip on each region card" UX
- Anti-hallucination strip is robust
- Result shape (days[], stops[], overnight) is reusable
- Already handles preferences hierarchy

But before adding a fourth route: refactor the candidate-fetch + Anthropic-call + strip-and-enrich logic into `lib/trip-generation/` and have `/api/itinerary`, `/api/on-this-road`, and the new v1 region route all call it. Reduces drift and makes future template changes one-file.

### AI integration — reuse or new?

**Recommendation:** reuse the `/api/itinerary` pattern. Anthropic SDK + Sonnet 4 + structured JSON prompt + hallucination strip. The 5-field input pattern (accommodation/transport/group/pace/days) translates well to a region-anchored variant where the "region" is implicit from the context.

For NYT 36-Hours-In template fill: use the same single-Sonnet-call pattern with a new system prompt. Consider extracting the system prompt to `lib/trip-generation/prompts/` so editorial team can iterate without code changes.

### Personalisation layer

The proposed flow (favourites + declared interests → preference vector → template emphasis):

- **Read favourites** from `user_saves` (existing API, GET).
- **Read declared interests** from `profiles.interests` (existing API).
- **Derive preference vector** — combine with weights (saved listings' tags weighted higher than declared activities). Compute server-side per request OR cache as `profiles.preference_vector` JSONB.
- **Inject into template emphasis** — in the Sonnet prompt, add a "USER PREFERENCES" section like the existing `/api/itinerary` pattern (lines 1364-1380). The pattern is already there; the data sources are already there.

Implementation cost is low — primarily wiring + prompt design.

## 9. Open questions for Matt

1. **v1 trip-builder location.** Should the v1 regional trip-builder be a new route (e.g. `/regions/[slug]/trip-builder`) or an inline component on `/regions/[slug]/page.js`? The latter is simpler; the former allows shareable URLs.

2. **Trip persistence for v1.** Should v1 regional trips be ephemeral (regenerated each visit) or persisted (cached per region+user)? Persisted has caching benefits + share URLs; ephemeral has simpler invalidation. The existing `/api/itinerary` is ephemeral; `/api/on-this-road/save` is persisted. v1 could go either way.

3. **Tagging axis alignment.** The proposed dual axis is subject + aspect. Does subject map to vertical (so sub_type and the new tag table overlap)? Or is subject a finer axis (e.g. sba's "winery" subject vs Matt's intended subject like "wine" / "spirits" / "beer")? If the latter, sub_type stays put and tags are orthogonal.

4. **Activity vocabulary unification.** `profiles.interests.activities` has 26 values. The proposed v1 aspect tags are 25-30. Should they be the same vocabulary (single `tags` table referenced by both) or different (preference-side activities ≠ listing-side aspect tags)? Same vocabulary halves the schema work but constrains future evolution.

5. **Save UI placement.** Heart icon on every listing card (every grid view) OR only on place detail page? The latter is conservative + lower visual noise; the former matches modern marketplace conventions (Airbnb, etc.). Existing place page has no save UI yet, so either is greenfield.

6. **Trail vs trip terminology.** The codebase uses "trail" (trails table, trail_stops, trails/builder) and "trip" (road_trips, plan_conversations, /itinerary) interchangeably. v1 should pick one or codify the distinction (e.g. trails = curated multi-day, trips = single-region day plans). Matt's call.

7. **Convergence question.** v1 builds a regional trip-builder. Should it replace `/itinerary`, replace `/plan-my-stay` (already gated), or sit alongside both? If alongside, when do they converge? This is the largest architectural call this audit surfaces.

8. **Embedding regen cost for v1.** If v1 introduces new tags/preferences feeding the embedding text, all 6,510 listings need re-embedding via Voyage (Phase 3 step 1 Batch 5 already flagged this concern). Plan as a one-time batch run; don't re-embed on every listing edit.

## 10. Summary by section

| Section | Status |
|---|---|
| Trail/trip-builder | 3 routes exist; substantial code; v1 should converge into shared module |
| Favouriting backend | ✓ complete (tables + API GET/POST/DELETE) |
| Favouriting frontend | ✗ does not exist; v1 builds from scratch |
| Tagging | sub_type/sub_types[] for single-axis subcategory; profiles.interests for preferences. Dual-axis v1 tags = new schema |
| User auth | ✓ Supabase Auth + shared JWT + profiles + interests |
| Listings/regions | post-Phase-2/3-step-1; helper-driven access pattern available |
| AI integration | 3 prompt patterns + Anthropic SDK + Voyage embeddings; v1 reuses `/api/itinerary` shape |
| Patterns to reuse | ListingCard, getListingRegion, hallucination-strip, two-stage Anthropic, profiles.interests, user_saves API |
| Patterns to avoid | listings.region text reads, manual slugification, ilike+alias counts, three-route-no-shared-code |
