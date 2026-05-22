# Trail Builder — Diagnostic Report

**Generated:** 2026-04-29
**Scope:** Read-only. No code changes. No migrations. No follow-up prompts.
**Trigger:** A `5 days in VIC, driving, couple, relaxed` itinerary with anchor `d3fe0b26-dce4-4712-b106-68cef66f46e7` produced a trail with stops scattered from Albury to Geelong to inner Melbourne, and pins reportedly mismatched against listing locations.

---

## Part 1 — Diagnose the specific trail

### 1.1 The anchor

| Field | Value |
|---|---|
| id | `d3fe0b26-dce4-4712-b106-68cef66f46e7` |
| name | **Murray Downs Homestead** |
| vertical / sub_type | `collection` / null |
| address | Murray Valley Highway, Swan Hill VIC 3585 |
| suburb / state / postcode | Swan Hill / VIC / 3585 |
| lat / lng | **-35.359547, 143.562297** |
| region | Murray River |
| data_source | `manually_curated` |
| created_at | 2026-04-01 |

**Reverse-geocode of stored coords:** *1a McNeill Court, Swan Hill VIC 3585.* The anchor's coordinates land in Swan Hill. **Anchor coords are correct.**

### 1.2 The cached trail — not preserved

The `/api/itinerary` endpoint caches generated responses in `user_trails` with `source='cache'` and a 24-hour TTL. Querying for the trail with this anchor + prompt + prefs returned **0 rows**. The whole `user_trails` table currently contains **0 rows** — every previously cached trail has either aged out or been wiped. Nothing to inspect from the original failed run.

### 1.3 Re-generated the trail to capture the actual stop selection

I hit `GET /api/itinerary?q=5+days+in+VIC&anchor=d3fe0b26-…&accommodation=need&transport=driving&group=couple&pace=relaxed` against the running dev server. The response just now (LLM is non-deterministic — your reported run will have differed in detail but likely the same shape):

| Field | Value |
|---|---|
| title | "Murray River to Melbourne: A Victorian Journey Through History and Craft" |
| region | VIC |
| duration.days | 5 (requested) |
| **`days` array length** | **3** ⚑ — the LLM compressed into 3 days despite a HARD CONSTRAINT in the prompt that says it must produce exactly 5 |
| total stops | **4** ⚑ — over 3 days, so 1 day has 1 stop, 1 day has 2, 1 day has 1 |
| overnight (any day) | **none** ⚑ — `accommodation=need` was passed but no Rest stops returned |
| `_fallback` flag | undefined → the Anthropic call succeeded; this is the LLM's actual output, not the haversine fallback |

**Stops returned, in order, with reverse-geocoded location:**

| # | Day | Stop | Vertical | Stored lat/lng | Reverse-geocoded |
|---|---|---|---|---|---|
| 1 | 1 | Murray Downs Homestead | collection | -35.360, 143.562 | Swan Hill, VIC |
| 2 | 2 | Gindu | sba | -37.358, 144.528 | Macedon Ranges, VIC |
| 3 | 2 | Mount Towrong Vineyard \| Winery & Cellar Door | sba | -37.408, 144.591 | Macedon Ranges, VIC |
| 4 | 3 | Sanguine Estate Wines — Heathcote | sba | -36.863, 144.692 | Heathcote, VIC |

All four stops resolve to suburbs that match their stated locations. **Listing coordinates are not the bug here.** The coordinates are correct; the *route construction* is the bug.

### 1.4 Distance dispersion

Per-day, this re-generated trail looks like:

| Day | Stops | Centroid | Max stop→centroid km | Mean km | Max stop→stop km |
|---|---|---|---|---|---|
| 1 | 1 | -35.360, 143.562 | 0.0 | 0.0 | 0 |
| 2 | 2 | -37.383, 144.560 | 4.5 | 4.5 | 6.6 |
| 3 | 1 | -36.863, 144.692 | 0.0 | 0.0 | 0 |

Inter-day jumps:

| Hop | Distance |
|---|---|
| Day 1 → Day 2 (Swan Hill → Macedon) | **~225 km** |
| Day 2 → Day 3 (Macedon → Heathcote) | **~70 km** |
| Day 3 → ?? (no Day 4 produced) | n/a |

**Each stop's distance from the anchor (Swan Hill):**

| # | Day | Stop | km from anchor |
|---|---|---|---|
| 1 | 1 | Murray Downs Homestead | 0 |
| 2 | 2 | Gindu | 226 |
| 3 | 2 | Mount Towrong Vineyard | 232 |
| 4 | 3 | Sanguine Estate Wines | 184 |

The user's reported run (Albury–Geelong–inner-Melbourne) is even more dispersed than mine, but it's the same failure mode: **the LLM picks venues from across the state with no real geographic spine.** Anchor lives in Swan Hill but only Day 1 is anywhere near it; Day 2 and Day 3 jump 225 km south then bounce 70 km northeast.

### 1.5 Day-assignment rationale

The `/api/itinerary` route does **no clustering, no sectoring, no nearest-neighbour ordering** of its own. The day grouping is **delegated entirely to the LLM**, instructed by free-text prompt rules. The actual rules in the system prompt (full text in §3.1):

> *"For city trips: all stops should be within ~25km of each other. Never include a venue 50+ km away."*
> *"For regional trips: stops should cluster within the core region. Avoid venues on the geographic fringe of the candidate list."*
> *"Before selecting a venue, check its lat/lng against the other stops you've chosen. If it's significantly further away than the rest, skip it and pick a closer alternative."*
> *"You MUST produce EXACTLY the number of days requested. If asked for 5 days, your `days` array must have 5 entries. Never compress into fewer days."*

These are prose constraints in a system prompt. There is **no code-level enforcement** that:
- The day count returned matches the day count requested
- Stops within a day cluster geographically
- Days proceed in a sensible direction (no zig-zag)
- Each day has accommodation when `accommodation=need` was requested

The constraints are advisory text that the LLM ignored on the run I observed. The model produced 3 days for a 5-day request, with no overnight stops, despite both being labelled MUST/REQUIRED in the prompt.

**Conclusion for Part 1:** the route shape problem is in **the generation logic, not the listing coordinates**. Coordinates of the anchor and all four stops are correct. The LLM is the route planner, and it's not reliably honouring the prose rules.

---

## Part 2 — Inventory of trail-generation surfaces

### Active generators (write to `trails` / `trail_stops` or produce trail-shaped responses)

| # | Surface | Page file | API route(s) | Strategy | Inputs | Day grouping | `trail_type` | URL params |
|---|---|---|---|---|---|---|---|---|
| 1 | **AI itinerary** (the bug source) | `app/itinerary/page.js` (1059 lines) | `app/api/itinerary/route.js` (2090 lines) | Anthropic LLM (claude-sonnet-4-20250514) with prose constraints; haversine fallback if Claude fails | Free-form prompt `q`; optional `anchor` listing id; flow params `accommodation`, `transport`, `group`, `pace` | LLM-driven; no code enforcement | does NOT write to `trails` (caches in `user_trails.cached_response`) | `/itinerary?q=...&anchor=...&accommodation=...&transport=...&group=...&pace=...` |
| 2 | **Manual user trail builder** | `app/trails/builder/page.js` | `app/api/trails/route.js` | Pure user choice — user adds venues to a list | Map clicks; venue search | None — user-controlled order via drag/numeric position | `type='user'` | `/trails/builder` |
| 3 | **Day-trip generator** | (no page; called from elsewhere) | `app/api/day-trips/route.js` | Pure spatial — anchor + radius + verticals | `anchor` listing id, radius (km), preference chips | Single-day; sorted by haversine distance from anchor; bearing labels for "north/east/etc." | (writes to `user_trails`, possibly day-trips-specific) | `/api/day-trips?...` |
| 4 | **On-this-road** (road-trip generator) | (no page; embedded into other flows) | `app/api/on-this-road/route.js` | Mapbox Directions for the route + venue filtering by buffer-km from polyline + Anthropic for narrative | Origin, destination, detour tolerance (`on_route`/`happy_to_detour`/`flexible`), trip length, departure timing, preference chips | Spatial buffer along route; LLM for the editorial narrative | (output shape only — doesn't persist) | `/api/on-this-road?...` |
| 5 | **Operator trails** | `(operator dashboard)` | `app/api/operators/trails/route.js` | (operator-mode trail authoring — out of scope for this report; called by operator dashboard) | Operator-supplied venues | n/a | `type='operator'` (likely) | `(operator-specific)` |
| 6 | **Editorial trails — Phase 1 admin** (uncommitted) | `app/admin/trails/pitch/[id]/page.js`, `app/admin/trails/[id]/page.js` | `app/api/admin/trails/pitches/*`, `app/api/admin/trails/*` | Two-phase: Voyage-3 embeddings → cosine similarity → Anthropic ranks/orders for structural recommendation only (no prose for the trail itself) | Editor's thesis, region, day count, vertical mix, must-include listings, season, mood tags | Editor-driven order with day-number per stop; Mapbox Directions for leg distances | `type='editorial'` | `/admin/trails/pitch/new` |
| 7 | **Editorial trails — legacy admin** | `app/admin/trails/page.js` | `app/api/trails/route.js` | Manual editor authoring | Editor picks venues + writes copy | None | `type='editorial'` | `/admin/trails` |

### Read-only consumers (don't generate, but render or inspect trails)

- `app/trails/page.js` — public trails index
- `app/trails/[slug]/page.js`, `TrailMap.js`, `TrailInteractive.js`, `ShareButton.js` — public slug page
- `app/t/[shortcode]/page.js` — share-link page for user-curated trails
- `app/day-trip/[tripId]/page.js` — day-trip render page
- `app/api/dashboard/route.js`, `app/api/dashboard/stats/route.js` — dashboard reads
- `app/api/cron/editorial-signals-agent/route.js` — Sunday signals (pulls from `trail_stops`)
- `app/api/cron/monday-briefing-agent/route.js` — Monday briefing
- `app/api/health/trail-builder/route.js` — health check ping

### Background scripts

- `scripts/seed-editorial-trails.mjs` — seeds the existing two editorial trails (writes to `trails` + `trail_stops`)
- `scripts/_trails_phase1_checks.mjs`, `_trails_lifecycle_test.mjs`, `_trails_scoring_unit_test.mjs` — Phase 1 test scaffolding (uncommitted)

### Verdict

There are **four real generators** of any complexity:

- `/api/itinerary` — LLM-driven trips
- `/api/day-trips` — spatial day-trips
- `/api/on-this-road` — road-trip route + venue buffer
- `/api/admin/trails/pitches/*` — Phase 1 editorial pitches (uncommitted)

Plus two manual surfaces (`/trails/builder`, `/admin/trails` legacy).

**There is no shared "trail engine".** Each route has its own haversine, its own filtering, its own day-grouping logic (or absence of it), its own LLM prompt. `/api/day-trips` carries its own haversine; `/api/itinerary` carries its own; `/api/on-this-road` has Mapbox-based route geometry. The Phase 1 pitch tool (uncommitted) introduced a *fifth* haversine in `lib/trails/scoring.js`. Convergence is a Part 5 question.

---

## Part 3 — Source code of each generator

### 3.1 `/api/itinerary` — the bug source

**File:** `app/api/itinerary/route.js` — **2,090 lines**. Pasting the relevant functions only.

#### 3.1.1 The system prompt (lines 1391–1433)

This is the entirety of the route-shape and day-grouping logic — there is no code below it that re-orders or validates the LLM's output:

```text
You are the Australian Atlas editorial voice — warm, knowledgeable, and passionate about independent Australian makers, producers, and cultural spaces. You build travel itineraries that feel like recommendations from a well-connected local friend.

TRIP CONTEXT: {N}-day trip · {region} · {accommodation} · {transport} · {group} · {pace}

HARD CONSTRAINTS:
- You may ONLY include venues from the provided candidate list. Never invent venues.
- Every listing_id in your response MUST exist in the candidate list.
- Each stop must reference a real venue by its exact id, name, vertical, lat, and lng from the candidates.
- You MUST produce EXACTLY the number of days requested. If asked for {N} days, your "days" array must have {N} entries. Never compress into fewer days.
- For multi-day trips, fill each day with {3-4 | 3-5 | 5-6} stops.
- If the focus category has limited venues, supplement with other verticals to create a rich experience.
- Keep notes concise (1-2 sentences) — evocative but practical.
- Title should be catchy and specific to the region/theme.
- Intro should be 2-3 sentences setting the scene.
- TIER WEIGHTING: Venues with "is_claimed": true or "is_featured": true are verified, operator-managed listings. When building the itinerary, PREFER these venues over unclaimed listings of similar relevance and location.

DAY SEQUENCING: Order venues within each day to follow a natural chronological flow:
1. Coffee and breakfast spots first (fine_grounds, table)
2. Nature, walks, and outdoor experiences mid-morning (field)
3. Galleries, museums, and cultural spaces around midday (collection)
4. Makers, studios, and craft workshops in the afternoon (craft)
5. Bookshops, homewares, and indie retail for afternoon browsing (corner, found)
6. Wine, beer, and spirit tastings in the late afternoon/evening (sba)
7. Accommodation as the final stop of the day (rest)
The ideal vertical order within a day is: fine_grounds → table → field → collection → craft → corner → found → sba → rest.

SCHEDULING RULES (strictly enforced):
- Small Batch Atlas listings (breweries, distilleries, wineries, cideries — vertical "sba") must NEVER be the first stop of any day. No one visits a cellar door at 9am.
- Schedule alcohol producers in the afternoon or as a day-ending stop — after at least 2 non-alcohol stops have appeared earlier in that day.
- A logical day flows: morning activity or cultural/retail stop → lunch or mid-day food → afternoon tasting or cellar door → evening accommodation.
- Cafes and food stops (Table Atlas, Fine Grounds) work well as day openers.
- Cultural, retail, and maker stops (Culture, Craft, Corner, Found) work well as morning stops.
- Rest Atlas accommodation is always the final item of the day, never a daytime stop.
- Maximum 2 Small Batch Atlas (sba) stops per day — variety across verticals is the point of the Atlas Network.

GEOGRAPHIC COHERENCE: All stops in the itinerary must be geographically tight.
- For city trips: all stops should be within ~25km of each other. Never include a venue 50+ km away.
- For regional trips: stops should cluster within the core region. Avoid venues on the geographic fringe of the candidate list.
- Before selecting a venue, check its lat/lng against the other stops you've chosen. If it's significantly further away than the rest, skip it and pick a closer alternative.
- A compact, walkable/drivable itinerary is ALWAYS better than a geographically scattered one, even if it means missing a "better" venue.

{anchorInstruction}{accommodationInstruction}{transportInstruction}{groupInstruction}{paceInstruction}{preferencesPrompt}

Respond with valid JSON only. No markdown, no code fences, just the JSON object.
```

The transport-driving instruction (line 1329):

```text
TRANSPORT: The user is driving. Plan a geographically coherent road trip:
- Day 1 stops should cluster around a logical starting point
- Each subsequent day should progress in a sensible direction — no jumping back and forth across the map
- The overall trail must have a clear arc: start point → journey → end point
- Do not include stops that require significant backtracking
- Sort stops within each day by proximity to minimise drive time between them
```

The accommodation-need instruction (line 1313):

```text
ACCOMMODATION: The user needs accommodation. REQUIRED for multi-day trips:
- Each day (except the final day) MUST have an "overnight" field containing a "rest" vertical venue
- Each day MUST have a DIFFERENT accommodation listing — do NOT reuse the same property across multiple days unless there are genuinely fewer Rest Atlas listings available than days, in which case mark consecutive nights as a multi-night stay by adding "(2-night stay)" to the note
- The accommodation MUST be in or near that day's geographic cluster — never across the state
- If no "rest" venue exists near a day's stops, set overnight to null and include "accommodation_gap": true in that day so the UI can show a fallback message
- The "overnight" field is separate from the "stops" array — accommodation does NOT count as a numbered stop
- Accommodation is non-negotiable when nights are specified — every night needs a place to stay
```

The anchor instruction (line 1357):

```text
ANCHOR VENUE (MANDATORY): The user started trail-building from a specific listing. This venue MUST be the FIRST stop of Day 1 — no exceptions.
- Listing ID: {id}
- Name: "{name}"
- Vertical: {vertical}
Place it as stops[0] on day 1, regardless of the day-sequencing rules above. The rest of the day should flow naturally from this starting point. Build the remaining itinerary around the anchor's location.
```

#### 3.1.2 Anchor → bounding box

```js
// (lines 884–901)
if (anchor?.lat && anchor?.lng) {
  // Build a ~30km bounding box around the anchor listing
  const radius = 0.3 // ~30km in degrees at Australian latitudes
  const anchorRegionName = getListingRegion(anchor)?.name
  geoBounds = {
    latMin: anchor.lat - radius, latMax: anchor.lat + radius,
    lngMin: anchor.lng - radius, lngMax: anchor.lng + radius,
    label: anchorRegionName || anchor.state || 'anchor',
  }
  region = anchorRegionName || anchor.state || region
  anchorRegionSource = `anchor listing "${anchor.name}" (${anchorRegionName || anchor.state})`
}
```

`radius = 0.3 degrees` is roughly **33 km** in latitude, **27 km** in longitude at Victorian latitudes. *But:* for the observed query `q="5 days in VIC"`, `parseItineraryQuery` resolves "VIC" to the entire state's bounding box, which **wins** over the anchor's tighter box. The anchor box is only used when `parseItineraryQuery` produced no `geoBounds`. So for "5 days in VIC", the candidate pool is **the entire state of Victoria** (~6,500+ listings), and the LLM is asked to pick stops within geographic coherence rules from that whole pool.

#### 3.1.3 Stop selection — the candidate query

```js
// (lines 1012–1020) base query for candidates
function baseQuery() {
  let q = sb
    .from('listings')
    .select(LISTING_COLS)
    .eq('status', 'active')
    .or('address_on_request.eq.false,address_on_request.is.null')
    .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
    .or('trail_suitable.eq.true,trail_suitable.is.null')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
  // …geo bounds filter applied per call site…
  // …vertical filter applied per call site…
}
```

The geo-bounds filter is `lat.gte/lte/lng.gte/lte` against `geoBounds.latMin/Max/lngMin/Max`. For `5 days in VIC`, that's the whole state.

#### 3.1.4 Distance helpers (lines 47–53)

```js
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
```

This is used **only** in:
- The fallback builder (when Claude fails)
- A vertical-ratio enforcement check (validating, not constructing)
- Some pre-filtering in the candidate pool

**It is not used to validate or repair the LLM output.** Day-grouping, day-sequencing, and accommodation-presence are not checked.

#### 3.1.5 Day grouping / sequencing — none in code

The LLM is asked to produce `days[]` with `stops[]` and `overnight`. The route accepts the LLM's output more or less as-is, then logs it and returns. There is no:
- check that `days.length === duration.days`
- check that each day has a stop on the same geographic side as the previous
- check that overnight is populated when `accommodation === 'need'`
- nearest-neighbour ordering pass over each day's stops

The fallback builder (lines 61–125) does have a simple "take next 4 sorted by quality_score" loop, but **fallback only triggers when the Claude call fails** — the LLM's wonky output goes straight through.

#### 3.1.6 Title generation

Title is generated by the LLM. The system prompt asks for "a catchy itinerary title". No deterministic title-builder.

### 3.2 `/api/day-trips` — pure spatial

**File:** `app/api/day-trips/route.js`. Self-contained haversine + bearing helpers (`bearingDeg` for compass labels):

```js
function haversineKm(lat1, lng1, lat2, lng2) { /* ... same formula ... */ }

function bearingDeg(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}
```

Stop selection (sketch — full route is ~500 lines):
- Take an `anchor` listing
- Walk an array of expanding radii: `RADIUS_STEPS = [30, 45, 60, 80, 100]` km
- Filter listings by haversine ≤ radius
- Sort by haversine distance, optionally by bearing for "X to the north" labels
- Single-day, no day grouping, no LLM

This generator works correctly for its narrow purpose. It's not the bug.

### 3.3 `/api/on-this-road` — Mapbox + LLM hybrid

**File:** `app/api/on-this-road/route.js`. Uses Mapbox Directions for the route polyline, then filters listings by buffer distance from any point on the polyline. Anthropic narrates the result.

Key config table:
```js
const DETOUR_CONFIG = {
  on_route:        { bufferKm: 8,  minQuality: 65, label: 'staying on route' },
  happy_to_detour: { bufferKm: 25, minQuality: 50, label: 'happy to detour' },
  flexible:        { bufferKm: 40, minQuality: 40, label: 'flexible routing' },
}

const TRIP_LENGTH_CONFIG = {
  passing_through: { days: 1, stopsPerDay: 5 },
  day_trip:        { days: 1, stopsPerDay: 10 },
  '2_days':        { days: 2, stopsPerDay: 6 },
  '3_days':        { days: 3, stopsPerDay: 5 },
  '4_plus':        { days: 4, stopsPerDay: 5 },
  half_day:        { days: 1, stopsPerDay: 4 },
  full_day:        { days: 1, stopsPerDay: 6 },
  weekend:         { days: 2, stopsPerDay: 5 },
}
```

This generator has explicit day-count mapping in code, unlike `/api/itinerary` which trusts the LLM. Day-grouping is sequential: stops along the polyline get split into N chunks based on cumulative distance, then narrated.

This generator is broadly correct in its day-grouping (ordered along route geometry) but has its own failure modes (e.g. insufficient venues in the buffer when `on_route` is selected on a sparse corridor).

### 3.4 `/api/admin/trails/pitches/*` — Phase 1 (uncommitted)

The Phase 1 pitch tool (uncommitted on hot-fix branch) takes a different approach — Voyage-3 embeddings + cosine similarity for the candidate pool, then Anthropic for **structural** recommendations only (sequence, day, rationale). The system prompt explicitly **forbids** the LLM from generating editorial prose. Editorial copy is hand-written by humans in the draft view. Day-grouping is editor-curated with explicit per-stop `day_number` and `position` fields, plus Mapbox Directions for actual leg distances.

This generator is the cleanest of the four — code-enforced separation of concerns, no LLM prose, no LLM day-grouping. But it's not in production; it's awaiting editorial review.

---

## Part 4 — Listing-coordinates audit

### 4.1 Sample

Pulled all listings created in the last 7 days where `data_source='manually_curated'` (the Candidate Review path) AND coords are populated. Pool size: **16**. Random sample = 16 (whole pool).

### 4.2 Reverse-geocoded coords vs stored suburb

| # | Name | Vertical | Stored suburb | State | Resolved suburb | Match |
|---|---|---|---|---|---|---|
| 1 | The Villas Barossa | rest | **null** | SA | Marananga | — (can't compare) |
| 2 | Ship Inn Stanley | rest | **null** | TAS | Stanley | — |
| 3 | Barossa Shiraz Estate | rest | **null** | SA | Lyndoch | — |
| 4 | Marananga Cottages | rest | **null** | SA | Marananga | — |
| 5 | McLaren Eye | rest | **null** | SA | Kangarilla | — |
| 6 | The Keep | rest | **null** | TAS | Goulds Country | — |
| 7 | The Crafers Hotel | rest | **null** | (null) | Crafers | — |
| 8 | Divine Domes McLaren Vale | rest | **null** | SA | McLaren Vale | — |
| 9 | Ukiyo House | rest | **null** | SA | Port Willunga | — |
| 10 | Sellicks Chills Vineyard Retreat | rest | **null** | SA | Sellicks Hill | — |
| 11 | Hotel California Road at Inkwell | rest | **null** | SA | Tatachilla | — |
| 12 | Aldgate Valley B&B | rest | **null** | SA | Mylor | — |
| 13 | Karawatha Cottages | rest | **null** | SA | Blewitt Springs | — |
| 14 | Thorngrove Manor | rest | **null** | SA | Crafers | — |
| 15 | The Dairyman Barossa | rest | **null** | SA | Williamstown | — |
| 16 | Shadow Creek | rest | **null** | SA | McLaren Vale | — |

### 4.3 Findings

**1. Coordinates are all plausible.** Every reverse-geocoded suburb is a real Australian suburb that matches the venue's address text (e.g. *Ship Inn Stanley → Stanley TAS*, *Barossa Shiraz Estate (1246 Barossa Valley Way, Lyndoch SA) → Lyndoch*). I could not flag any of the 16 as having wrong coordinates.

**2. The structured `suburb` field is NULL for 100% of recent Candidate Review listings.** All 16 have `suburb: null` despite the `address` field containing the suburb in plain text. The Candidate Review form is capturing **address as free-text** but **not parsing or storing the suburb separately**.

Widening the window to 30 days: **574 of 6,063 (9.5%) `data_source='manually_curated'` listings have `suburb` NULL.** The pattern is *more* prevalent in the most recent week (100%) than over 30 days (9.5%) — suggesting either the Candidate Review form was recently changed, or the recent batch went through a different path that drops suburb.

**3. The reported "Brunswick coffee shop pinned near Geelong" symptom is not reproducible against current data.** Querying the five Brunswick-named or Brunswick-addressed `fine_grounds` listings shows all five within 1.3 km of Brunswick centre:

| Name | Stored suburb | Coords | km from Brunswick centre |
|---|---|---|---|
| Padre Coffee | Brunswick East | -37.764, 144.973 | 1.3 |
| Wide Open Road Cafe | Brunswick | -37.776, 144.961 | 0.7 |
| Wide Open Road Coffee Roasters | Brunswick | -37.776, 144.961 | 0.7 |
| Code Black Coffee | Brunswick East | -37.774, 144.968 | 0.9 |
| Wood and Co Coffee | null | -37.768, 144.955 | 0.5 |

Either the symptom was transient (since fixed) or it's at a specific listing not surfaced by name/address search. Worth re-checking against a specific listing the user saw misplaced; without that pointer, I can't reproduce.

**4. Distance-to-suburb-centroid distribution: not computable on this sample.** Because every listing has `suburb: null`, there's no centroid to compare against. For listings that have BOTH coords and suburb populated (the 5,489 in the wider 30-day pool with suburb non-null), this audit could be re-run; that's a Part 5 follow-up.

### 4.4 The implicit fingerprint of "centroid fallback geocoding"

The user suspects coords come from suburb-centroid fallback. What that would look like:
- Stored coords land within ~50 m of the suburb centroid (because the geocoder couldn't resolve a street address)
- Address field has a street address but coords don't reflect it
- Multiple listings in the same suburb cluster on a single point

I could not confirm this fingerprint on the current 7-day sample — the coords don't match suburb centroids tightly. They land at plausible specific addresses. The suburb-centroid-fallback risk may be more significant in **older** or **AI-generated** (`data_source='ai_generated'`) listings, which I haven't sampled here. Worth a separate sweep on the full table — flagged as a Part 5 backfill task.

---

## Part 5 — Staged fix plan (no implementation)

The plan below is staged so each piece can ship independently. None of this is in code yet.

### Stage A — Address capture in Candidate Review

**Scope:** Update the Candidate Review form to capture **structured address fields** (street, suburb, state, postcode) as required, separately from the free-text `address` column. On submit:
1. Validate suburb + state are present.
2. Forward-geocode "street, suburb, state, AU" via Mapbox to get a precise lat/lng.
3. Store `street_address`, `suburb`, `state`, `postcode`, `lat`, `lng` from geocoder result.
4. If geocoder confidence is low, surface a confirmation step before save.

**Dependencies:** None. The columns already exist (`street_address`, `suburb`, `state`, `postcode`, `lat`, `lng`).

**Could ship independently:** Yes. Touches only the Candidate Review submit flow.

**Risks:** Geocoder is rate-limited; need to handle 429s. Editor friction if the geocoder picks the wrong place — needs a "yes that's right" confirm step with map preview. Existing addresses with ambiguous suburb may need a manual disambiguation flow.

### Stage B — Backfill identification (CSV, no auto-fix)

**Scope:** A read-only script that produces a CSV of suspect listings, ranked by how likely the coords are wrong. Heuristics:
1. `suburb` is null but `address` text contains a recognisable suburb name → flag.
2. Reverse-geocode (lat, lng); compare to address-text suburb → flag mismatches.
3. Distance to forward-geocoded suburb centroid is < 50 m AND address contains a street number → suspect centroid fallback.
4. Multiple listings within 5 m of each other (clustered on same point) → suspect bulk centroid geocoding.
5. `data_source='ai_generated'` listings disproportionately affected → high priority for review.

CSV columns: `id, name, vertical, address, stored_suburb, stored_lat, stored_lng, resolved_suburb, dist_to_suburb_centroid_km, cluster_size, suspicion_score, suggested_action`.

**Dependencies:** Stage A doesn't have to land first; this is read-only. But Stage A reduces the population that gets added to the backfill queue going forward.

**Could ship independently:** Yes. Read-only.

**Risks:** Mapbox calls × 6,500+ listings will cost real money and take real time. Should batch and rate-limit. False positives where the venue genuinely is at the suburb centroid (a small town with one coffee shop on the main street). The CSV is informational; humans decide what to fix.

### Stage C — Trail-generation logic fixes

This is the largest piece. Three sub-stages, in the order they'd ship:

#### C.1 Validate and repair `/api/itinerary` LLM output

**Scope:** After the Anthropic call returns, before the response goes to the client:
1. **Day-count check.** If `days.length !== duration.days`, either re-prompt once with the gap noted or drop into the haversine fallback.
2. **Accommodation check.** If `accommodation='need'` and `duration.days > 1` and any non-final day's `overnight` is null, run a second pass that picks the nearest unused `rest` venue to that day's stop centroid.
3. **Day-cluster check.** For each day, compute centroid + max stop-to-centroid distance. If any stop is >50 km from the day's centroid, swap it for the nearest candidate of the same vertical that fits inside the cluster. If no swap exists, drop the outlier and add a warning.
4. **Day-sequence check.** If consecutive days' centroids zigzag (the angle between consecutive segment vectors is > 120°), reorder days to follow a monotonic direction.

**Dependencies:** None — the candidate pool is already pulled.

**Could ship independently:** Yes. Pure post-processing on the existing /api/itinerary response.

**Risks:** Adds latency. The repairs may reject venues the editor would prefer. Loud failure (drop the result, return a "we couldn't build a coherent trail" message) might be better than a silent repair that produces something weird.

#### C.2 Bound the candidate pool more aggressively

**Scope:** "5 days in VIC" currently dumps the entire state into the candidate pool. The LLM then has to do all geographic clustering itself. Better: when `parseItineraryQuery` resolves only at state level AND an anchor is present, **prefer the anchor's bounding box over the state-level box** (currently the state box wins). When no anchor is present and the query is state-level, refuse to plan and prompt the user for a more specific region.

**Dependencies:** Stage C.1 should land first (or alongside) so the LLM output is validated. C.2 alone reduces but doesn't eliminate the bug — the LLM is still the day-grouper.

**Could ship independently:** Yes, but lower value alone.

**Risks:** Users typing "5 days in VIC" will hit a "tell us where" prompt instead of getting a result. UX friction unless paired with a region picker.

#### C.3 Code-driven day-grouping (replace LLM as the planner)

**Scope:** Restructure `/api/itinerary` so the LLM is the **narrator**, not the **planner**:
1. Code selects the candidate pool (region + verticals).
2. Code clusters candidates into N day-clusters using k-means (k = day count) or convex-hull / centroid-based partitioning.
3. Code orders days using nearest-neighbour TSP heuristic on cluster centroids, anchored at the `anchor` listing if present.
4. Code orders stops within each day by nearest-neighbour from the previous stop, with vertical-ordering preferences applied as soft tiebreakers.
5. Code picks an accommodation per day from `rest` candidates near the cluster centroid.
6. **Then** the LLM is given the structured plan and asked only for: title, intro, and one `note` per stop. No restructuring power.

**Dependencies:** Cleanest if C.1 has shipped first (post-processing already exists). Aligns architecturally with what the Phase 1 pitch tool already does (Voyage-3 + structural-only LLM).

**Could ship independently:** Yes. Bigger lift but the most robust outcome.

**Risks:** Code-driven clustering can produce locally-optimal but editorially flat trails (e.g. perfectly clustered but missing the spotlight venue that's 35 km out of the way). Phase 1 of the pitch tool encountered exactly this — the LLM at least had the freedom to break the spatial budget for a worth-it venue. The Phase 1.1 backlog already has an item "tighten candidate prompt to refuse over-cap sequences" — this is the same problem from the other side. Convergence on the right balance will need editorial input.

### Stage D — Consolidate generators or fix independently?

There are now five different generators with five different haversines and five different opinions on what a trail is. The Phase 1 pitch tool's `lib/trails/` library is the most thoughtful of them but is uncommitted.

**Recommendation:** Don't consolidate yet. Fix `/api/itinerary` (Stage C). Watch how the Phase 1 pitch tool performs after editorial review tomorrow. Once Phase 1 is in production for a few weeks, evaluate whether `/api/itinerary` and `/api/day-trips` can adopt the same `lib/trails/scoring.js` + `lib/trails/mapbox-distances.js` shared engine. Premature consolidation while three of the five are still in flux will create churn.

**Dependencies:** Stage C.3 should be shipped before considering D.

**Could ship independently:** Itself yes, but the right time is *after* Phase 1 has been observed in real editorial use.

**Risks:** Five independent code paths means five chances for a bug like this to re-emerge. But premature shared abstraction is worse than five copies that each work.

---

## Part 6 — Read-only confirmation

Nothing in the working tree was modified by this investigation. Files created (all under `scripts/` and `docs/`, all uncommitted):
- `scripts/_trail_diagnostic.mjs` — Part 1 + Part 4 query script
- `scripts/_listing_coords_audit.mjs` — Part 4 deeper audit script
- `docs/trail-builder-diagnostic.md` — this report

No DB changes. No git commits. No deploys. No follow-up prompts proposed.
