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

const SELECT = `id, name, slug, description, region, state, suburb, lat, lng, hero_image_url, vertical, sub_type, sub_types, quality_score, is_featured, is_claimed, editors_pick, ${LISTING_REGION_SELECT}`

// ── Slot category lenses ──
// What kind of place makes sense at each point in the day. sub_type is the
// fine-grained signal where a vertical spans breakfast and dinner (table).
const ACTIVITY_VERTICALS = ['field', 'collection', 'craft', 'corner', 'found', 'way', 'sba']
const BREAKFASTY = /cafe|bakery|brunch|tea|patisserie|coffee/
const NOT_DINNER = /bakery|cafe|tea|patisserie|coffee|ice_cream|gelat/

const SLOT_FILTERS = {
  breakfast: (l) =>
    l.vertical === 'fine_grounds' || (l.vertical === 'table' && BREAKFASTY.test(l.sub_type || '')),
  lunch: (l) =>
    l.vertical === 'table' || (l.vertical === 'fine_grounds' && /cafe/.test(l.sub_type || '')),
  dinner: (l) => l.vertical === 'table' && !NOT_DINNER.test(l.sub_type || ''),
  morning: (l) => ACTIVITY_VERTICALS.includes(l.vertical),
  afternoon: (l) => ACTIVITY_VERTICALS.includes(l.vertical),
  evening: (l) =>
    l.vertical === 'collection' ||
    l.vertical === 'sba' ||
    (l.vertical === 'table' && /wine_bar|bar/.test(l.sub_type || '')),
  sleep: (l) => l.vertical === 'rest',
}
const ACTIVITY_SLOTS = new Set(['morning', 'afternoon'])

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

  // Slot mode quietly casts a wider net than the requested radius so sparse
  // regional areas can still fill a trio — closeness is a ranking signal, so
  // nearer places always win when they exist.
  const queryRadius = slot ? Math.min(Math.max(radius * 3, 60), 150) : radius

  // ── Bounding-box prefilter, then haversine ──
  const latDelta = queryRadius / 111
  const lngDelta = queryRadius / (111 * Math.cos((lat * Math.PI) / 180))

  const { data, error } = await excludeTestListings(
    sb
      .from('listings')
      .select(SELECT)
      .eq('status', 'active')
      .in('vertical', getPublicVerticals())
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', lat - latDelta)
      .lte('lat', lat + latDelta)
      .gte('lng', lng - lngDelta)
      .lte('lng', lng + lngDelta)
      .or('geocode_confidence.is.null,geocode_confidence.neq.low')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .limit(600)
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const inRange = (data || [])
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({ ...l, distance_km: Math.round(haversineKm(lat, lng, l.lat, l.lng) * 10) / 10 }))
    .filter((l) => l.distance_km <= queryRadius)

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
    let pool = inRange.filter(
      (l) => slotFilter(l) && !exclude.has(String(l.id)) && !seeds.includes(String(l.id))
    )
    // Activity slots lean toward the traveller's stated interests, as long as
    // that still leaves a full trio to offer.
    if (ACTIVITY_SLOTS.has(slot) && interests.length) {
      const interested = pool.filter((l) => interests.includes(l.vertical))
      if (interested.length >= limit) pool = interested
    }

    // Blend closeness to the anchor with the trip's taste (or raw quality
    // order before any taste exists). Lower score = better.
    const qualityIndex = new Map(inRange.map((l, i) => [String(l.id), i]))
    const scored = pool
      .map((l) => {
        const id = String(l.id)
        const rankNorm = tasteRank.size
          ? tasteRank.has(id)
            ? tasteRank.get(id) / tasteRank.size
            : 1
          : (qualityIndex.get(id) || 0) / Math.max(inRange.length, 1)
        const distNorm = Math.min(l.distance_km / Math.max(radius, 1), 1.5)
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
    suggestions = picked
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
      l.description && l.description.length > 220
        ? l.description.slice(0, 220).trimEnd() + '…'
        : l.description || null,
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
