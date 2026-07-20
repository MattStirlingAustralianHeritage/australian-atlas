import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT, getListingRegion } from '@/lib/regions'
import { excludeTestListings } from '@/lib/listings/publicFilter'
import { getPublicVerticals } from '@/lib/verticalUrl'

/**
 * GET /api/itinerary/places
 *
 * The data spine of the Itinerary Engine. Given a destination (region slug or
 * lat/lng centre) it returns two things:
 *
 *   pins        — a lightweight set of every worth-visiting place in range,
 *                 for the map's discovery layer ("what's out there").
 *   suggestions — a curated, interest-filtered, cross-vertical-diversified
 *                 shortlist for the discovery rail ("what to add"), each with a
 *                 distance from the anchor point.
 *
 * Params:
 *   region      region slug (resolves centre + framing zoom)
 *   lat,lng     explicit anchor (overrides region centre) — used for
 *               "near this stop" rail queries
 *   radius      km override; otherwise derived from the region's map zoom
 *   interests   comma-separated vertical keys (filters suggestions only;
 *               in slot mode they weight the activity slots)
 *   exclude     comma-separated listing ids already on the itinerary
 *   seeds       comma-separated listing ids already chosen — their embedding
 *               centroid re-ranks suggestions toward the trip's taste
 *               (the discovery engine's semantic arm, via search_listings_hybrid)
 *   slot        breakfast | morning | lunch | afternoon | dinner | evening | sleep
 *               — the guided chooser's category lens. Slot mode returns a small
 *               trio of sensible choices: category-appropriate, close to the
 *               anchor, similar in vibe to what's already been picked, and
 *               spread across verticals so the three never read as one genre.
 *   limit       suggestion count (default 12, max 30; slot mode default 3)
 *   pins        '0' to skip the pin payload (rail-only refetches)
 */

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Broad enough to cover a region without dragging in the next city over.
// Metro regions frame tight (zoom 12); sprawling regional ones frame wide.
function radiusForZoom(zoom) {
  if (zoom >= 12) return 22
  if (zoom >= 11) return 35
  if (zoom >= 10) return 55
  if (zoom >= 9) return 85
  if (zoom >= 8) return 120
  return 160
}

const SELECT = `id, name, slug, description, region, state, suburb, lat, lng, hero_image_url, vertical, sub_type, sub_types, quality_score, is_featured, is_claimed, editors_pick, opening_hours, ${LISTING_REGION_SELECT}`

// ── Slot category lenses ──
// What kind of place makes sense at each point in the day. sub_type is the
// fine-grained signal where a vertical spans breakfast and dinner (table).
// craft + way are absent: no craft studio currently carries the public_retail
// walk-in opt-in, and Way experiences are booked, not dropped in on.
const ACTIVITY_VERTICALS = ['field', 'collection', 'corner', 'found', 'sba']
const BREAKFASTY = /cafe|bakery|brunch|tea|patisserie|coffee/
// Table listings that are shops or farm experiences, not sit-down meals —
// never offered for lunch or dinner (great as morning/afternoon stops).
const SHOP_NOT_MEAL = /market|grocer|farm_gate|butcher|fishmonger|pick_your_own|chocolatier|confectioner|creamery|providore|deli|orchard|ice_cream|gelat/
const NOT_DINNER = new RegExp(`bakery|cafe|tea|patisserie|coffee|${SHOP_NOT_MEAL.source}`)

// Name-level guard for rows whose sub_type is miscategorised (an
// "Icecreamery" filed as restaurant) — meal slots only, deliberately narrow.
const SWEET_SHOP_NAME = /ice ?cream|gelat|donut|doughnut|candy|lolly/i

const SLOT_FILTERS = {
  breakfast: (l) =>
    l.vertical === 'fine_grounds' || (l.vertical === 'table' && BREAKFASTY.test(l.sub_type || '')),
  lunch: (l) =>
    ((l.vertical === 'table' && !SHOP_NOT_MEAL.test(l.sub_type || '')) ||
      (l.vertical === 'fine_grounds' && /cafe/.test(l.sub_type || ''))) &&
    !SWEET_SHOP_NAME.test(l.name || ''),
  dinner: (l) =>
    l.vertical === 'table' && !NOT_DINNER.test(l.sub_type || '') && !SWEET_SHOP_NAME.test(l.name || ''),
  morning: (l) => ACTIVITY_VERTICALS.includes(l.vertical),
  afternoon: (l) => ACTIVITY_VERTICALS.includes(l.vertical),
  evening: (l) =>
    l.vertical === 'collection' ||
    l.vertical === 'sba' ||
    (l.vertical === 'table' && /wine_bar|bar/.test(l.sub_type || '')),
  sleep: (l) => l.vertical === 'rest',
}
const ACTIVITY_SLOTS = new Set(['morning', 'afternoon'])

// ── Opening-hours gate for meal slots ──
// A dinner suggestion must actually serve dinner: when a listing carries
// opening hours (Google-style weekday_text), the slot's check hour must fall
// inside some day's open interval. Unknown or unparsable hours fail OPEN —
// coverage is ~45% and absence of data shouldn't empty a country town's trio.
const SLOT_OPEN_HOUR = { breakfast: 9.5, lunch: 12.5, dinner: 19, evening: 20 }

function parseClockTime(t, inheritMeridiem) {
  let s = String(t).trim().toLowerCase()
  // Google drops the leading meridiem when both endpoints share it
  // ("5:00 – 9:00 PM" means 5 PM–9 PM). When this token has no am/pm of its
  // own, inherit the range's other end so the start time still parses.
  if (inheritMeridiem && !/(am|pm)$/.test(s)) s += ` ${inheritMeridiem}`
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (!m) return null
  let h = parseInt(m[1], 10) % 12
  if (m[3] === 'pm') h += 12
  return h + (m[2] ? parseInt(m[2], 10) / 60 : 0)
}

// Condense weekday_text into card-sized lines: consecutive days sharing the
// same hours collapse into a range ("Mon–Fri · 9:00 AM – 5:00 PM").
const DAY_ABBREV = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }
function condenseHours(openingHours) {
  const wt = openingHours?.weekday_text
  if (!Array.isArray(wt) || wt.length === 0) return null
  const days = []
  for (const line of wt) {
    const i = String(line).indexOf(': ')
    if (i < 0) continue
    const day = DAY_ABBREV[String(line).slice(0, i).trim().toLowerCase()]
    if (!day) continue
    days.push({ day, rest: String(line).slice(i + 2).trim() })
  }
  if (!days.length) return null
  const groups = []
  for (const d of days) {
    const last = groups[groups.length - 1]
    if (last && last.rest === d.rest) last.days.push(d.day)
    else groups.push({ days: [d.day], rest: d.rest })
  }
  return groups
    .map((g) => `${g.days.length > 2 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days.join(' & ')} · ${g.rest}`)
    .slice(0, 4)
}

function openAtHour(openingHours, checkHour) {
  const wt = openingHours?.weekday_text
  if (!Array.isArray(wt) || wt.length === 0) return true // unknown → fail open
  let parsedAny = false
  for (const line of wt) {
    const i = String(line).indexOf(': ')
    if (i < 0) continue
    const rest = String(line).slice(i + 2).trim()
    if (/closed/i.test(rest)) {
      parsedAny = true
      continue
    }
    if (/24 hours/i.test(rest)) return true
    for (const range of rest.split(',')) {
      const parts = range.split(/\s*(?:–|—|−|to|-)\s*/i).map((x) => x.trim()).filter(Boolean)
      if (parts.length !== 2) continue
      const endMeridiem = (parts[1].toLowerCase().match(/(am|pm)$/) || [])[1] || null
      const start = parseClockTime(parts[0], endMeridiem)
      let end = parseClockTime(parts[1])
      if (start == null || end == null) continue
      parsedAny = true
      if (end <= start) end += 24 // overnight service
      if (checkHour >= start && checkHour < end) return true
    }
  }
  return parsedAny ? false : true // nothing parsable → fail open
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const regionSlug = (searchParams.get('region') || '').trim()
  let lat = parseFloat(searchParams.get('lat'))
  let lng = parseFloat(searchParams.get('lng'))
  let zoom = parseInt(searchParams.get('zoom')) || 0
  const radiusParam = parseFloat(searchParams.get('radius'))
  const interests = (searchParams.get('interests') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const exclude = new Set(
    (searchParams.get('exclude') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  const seeds = (searchParams.get('seeds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25)
  const slot = (searchParams.get('slot') || '').trim()
  if (slot && !SLOT_FILTERS[slot]) {
    return NextResponse.json({ error: `Unknown slot '${slot}'` }, { status: 400 })
  }
  const limit = Math.min(parseInt(searchParams.get('limit')) || (slot ? 3 : 12), 30)
  const wantPins = searchParams.get('pins') !== '0'

  const sb = getSupabaseAdmin()

  // ── Resolve the anchor ──
  let regionName = null
  let regionState = null
  if (regionSlug) {
    const { data: region } = await sb
      .from('regions')
      .select('name, state, center_lat, center_lng, map_zoom')
      .eq('slug', regionSlug)
      .maybeSingle()
    if (region) {
      regionName = region.name
      regionState = region.state
      if (!Number.isFinite(lat)) lat = region.center_lat
      if (!Number.isFinite(lng)) lng = region.center_lng
      if (!zoom) zoom = region.map_zoom || 9
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'A region or lat/lng is required' }, { status: 400 })
  }
  if (!zoom) zoom = 9

  const radius = Number.isFinite(radiusParam) ? radiusParam : radiusForZoom(zoom)

  // ── One ring of listings around the anchor: bbox prefilter, then haversine ──
  // The query is quality-ordered with a hard row cap, so a WIDE ring near a
  // metro fills up with high-scoring city listings and silently drops the
  // locals (a Castlemaine breakfast offering Carlton roasters). Always fetch
  // TIGHT first; the slot pipeline below expands ring by ring only when the
  // local pool is genuinely short.
  const fetchRing = async (ringKm) => {
    const dLat = ringKm / 111
    const dLng = ringKm / (111 * Math.cos((lat * Math.PI) / 180))
    const { data, error } = await excludeTestListings(
      sb
        .from('listings')
        .select(SELECT)
        .eq('status', 'active')
        .in('vertical', getPublicVerticals())
        // Every itinerary suggestion must be drop-in visitable. trail_eligible
        // is the generated gate for exactly that (fixed, walk-in, drive-to):
        // it excludes appointment-only studios, tours, mobile/pop-up presence
        // and non-visitable listings (migration 248).
        .eq('trail_eligible', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', lat - dLat)
        .lte('lat', lat + dLat)
        .gte('lng', lng - dLng)
        .lte('lng', lng + dLng)
        .or('geocode_confidence.is.null,geocode_confidence.neq.low')
        .order('quality_score', { ascending: false, nullsFirst: false })
        .limit(600)
    )
    if (error) throw new Error(error.message)
    return (data || [])
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({ ...l, distance_km: Math.round(haversineKm(lat, lng, l.lat, l.lng) * 10) / 10 }))
      .filter((l) => l.distance_km <= ringKm)
  }

  let inRange
  try {
    inRange = await fetchRing(radius)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  // Base-bbox deltas for the taste RPC below.
  const latDelta = radius / 111
  const lngDelta = radius / (111 * Math.cos((lat * Math.PI) / 180))

  // ── Pins: everything in range, trimmed for the wire ──
  const pins = wantPins
    ? inRange.slice(0, 400).map((l) => ({
        id: String(l.id),
        name: l.name,
        slug: l.slug,
        vertical: l.vertical,
        sub_type: l.sub_type,
        region: getListingRegion(l)?.name || l.region || null,
        state: l.state,
        lat: l.lat,
        lng: l.lng,
        description:
          l.description && l.description.length > 140
            ? l.description.slice(0, 140).trimEnd() + '…'
            : l.description || null,
      }))
    : undefined

  // ── Taste centroid (the discovery engine's semantic arm) ──
  // Average the embeddings of the stops already chosen and ask the hybrid
  // retrieval RPC for the closest neighbours inside the trip's bbox. The
  // resulting rank re-orders each vertical bucket below, so "what you've
  // added so far" steers what we suggest next — without collapsing the
  // cross-vertical mix.
  const tasteRank = new Map()
  if (seeds.length) {
    try {
      const { data: seedRows } = await sb
        .from('listings')
        .select('embedding')
        .in('id', seeds)
        .not('embedding', 'is', null)
      const vectors = (seedRows || [])
        .map((r) => {
          try {
            return typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding
          } catch {
            return null
          }
        })
        .filter((v) => Array.isArray(v) && v.length)
      if (vectors.length) {
        const dim = vectors[0].length
        const centroid = new Array(dim).fill(0)
        for (const v of vectors) for (let i = 0; i < dim; i++) centroid[i] += v[i]
        for (let i = 0; i < dim; i++) centroid[i] /= vectors.length
        const literal = `[${centroid.map((n) => n.toFixed(6)).join(',')}]`
        const { data: ranked } = await sb.rpc('search_listings_hybrid', {
          query_embedding: literal,
          query_text: null,
          match_count: 120,
          similarity_floor: 0,
          min_quality: 40,
          include_way: true,
          lat_min: lat - latDelta,
          lat_max: lat + latDelta,
          lng_min: lng - lngDelta,
          lng_max: lng + lngDelta,
        })
        ;(ranked || []).forEach((r, i) => tasteRank.set(String(r.id), i))
      }
    } catch {
      /* taste ranking is best-effort — quality order still applies */
    }
  }

  let suggestions
  if (slot) {
    // ── Slot mode: a trio of sensible choices for one moment in the day ──
    const slotFilter = SLOT_FILTERS[slot]
    const openHour = SLOT_OPEN_HOUR[slot]
    const eligible = (l) =>
      slotFilter(l) &&
      !exclude.has(String(l.id)) &&
      !seeds.includes(String(l.id)) &&
      (openHour == null || openAtHour(l.opening_hours, openHour))

    // Start with the tight ring; only widen (×2, capped 150 km) while the
    // local pool can't offer a real choice. A country town keeps its own
    // cafés at the front — the next town over only appears when needed, and
    // the metro two hours away only when there's nothing nearer.
    let pool = inRange.filter(eligible)
    let ringKm = radius
    const seen = new Set(pool.map((l) => String(l.id)))
    const MIN_POOL = Math.max(limit * 3, 9)
    while (pool.length < MIN_POOL && ringKm < 150) {
      ringKm = Math.min(ringKm * 2, 150)
      try {
        const wider = await fetchRing(ringKm)
        for (const l of wider) {
          const id = String(l.id)
          if (!seen.has(id) && eligible(l)) {
            seen.add(id)
            pool.push(l)
          }
        }
      } catch {
        break
      }
    }

    // Activity slots lean toward the traveller's stated interests, as long as
    // that still leaves a full trio to offer.
    if (ACTIVITY_SLOTS.has(slot) && interests.length) {
      const interested = pool.filter((l) => interests.includes(l.vertical))
      if (interested.length >= limit) pool = interested
    }

    // Blend closeness to the anchor with the trip's taste (or raw quality
    // order before any taste exists). Lower score = better. Distance is
    // normalised against the REQUESTED radius, uncapped enough that a
    // 100 km detour can't out-score a good local option.
    const byQuality = [...pool].sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
    const qualityIndex = new Map(byQuality.map((l, i) => [String(l.id), i]))
    const scored = pool
      .map((l) => {
        const id = String(l.id)
        const rankNorm = tasteRank.size
          ? tasteRank.has(id)
            ? tasteRank.get(id) / tasteRank.size
            : 1
          : (qualityIndex.get(id) || 0) / Math.max(pool.length, 1)
        const distNorm = Math.min(l.distance_km / Math.max(radius, 1), 4)
        return { l, score: rankNorm * 0.55 + distNorm * 0.45 }
      })
      .sort((a, b) => a.score - b.score)

    // Spread the trio across verticals where possible, then backfill by score.
    const picked = []
    const usedVerticals = new Set()
    for (const { l } of scored) {
      if (picked.length >= limit) break
      if (!usedVerticals.has(l.vertical)) {
        picked.push(l)
        usedVerticals.add(l.vertical)
      }
    }
    for (const { l } of scored) {
      if (picked.length >= limit) break
      if (!picked.includes(l)) picked.push(l)
    }
    // Better a short trio than an absurd one: never offer a "nearby" stop
    // more than ~4× the search radius away, even in thin country coverage.
    suggestions = picked.filter((l) => l.distance_km <= Math.max(radius * 4, 60))
  } else {
    // ── Rail mode: interest-filtered, taste-then-quality, cross-vertical mix ──
    const interested = interests.length
      ? inRange.filter((l) => interests.includes(l.vertical))
      : inRange
    const pool = interested.filter((l) => !exclude.has(String(l.id)) && !seeds.includes(String(l.id)))

    // Round-robin across verticals so the rail never reads as one category.
    const buckets = new Map()
    for (const l of pool) {
      if (!buckets.has(l.vertical)) buckets.set(l.vertical, [])
      buckets.get(l.vertical).push(l)
    }
    // Buckets arrive quality-desc from the DB; when we know the trip's taste,
    // listings the centroid recognises float to the front of their bucket.
    if (tasteRank.size) {
      for (const arr of buckets.values()) {
        arr.sort((a, b) => {
          const ra = tasteRank.has(String(a.id)) ? tasteRank.get(String(a.id)) : Infinity
          const rb = tasteRank.has(String(b.id)) ? tasteRank.get(String(b.id)) : Infinity
          return ra - rb
        })
      }
    }
    const order = interests.length ? interests.filter((v) => buckets.has(v)) : [...buckets.keys()]
    suggestions = []
    let round = 0
    while (suggestions.length < limit && order.some((v) => (buckets.get(v) || [])[round])) {
      for (const v of order) {
        if (suggestions.length >= limit) break
        const item = (buckets.get(v) || [])[round]
        if (item) suggestions.push(item)
      }
      round++
    }
  }

  const shape = (l) => ({
    id: String(l.id),
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    sub_type: l.sub_type,
    region: getListingRegion(l)?.name || l.region || null,
    state: l.state,
    suburb: l.suburb || null,
    lat: l.lat,
    lng: l.lng,
    hero_image_url: l.hero_image_url,
    description:
      l.description && l.description.length > 300
        ? l.description.slice(0, 300).trimEnd() + '…'
        : l.description || null,
    hours_lines: condenseHours(l.opening_hours),
    distance_km: l.distance_km,
    is_featured: l.is_featured,
    is_claimed: l.is_claimed,
    editors_pick: l.editors_pick === true,
    taste_match: tasteRank.has(String(l.id)),
  })

  return NextResponse.json(
    {
      pins,
      suggestions: suggestions.map(shape),
      total_in_range: inRange.length,
      center: { lat, lng, zoom },
      radius_used: radius,
      region: regionName,
      state: regionState,
    },
    { headers: { 'Cache-Control': 'private, max-age=60' } }
  )
}
