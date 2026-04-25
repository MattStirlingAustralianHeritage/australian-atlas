import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'
import { LISTING_REGION_SELECT } from '@/lib/regions'

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Vertical URL mappings
const VERTICAL_URLS = {
  sba: 'https://smallbatchatlas.com.au',
  collection: 'https://collectionatlas.com.au',
  craft: 'https://craftatlas.com.au',
  fine_grounds: 'https://finegroundsatlas.com.au',
  rest: 'https://restatlas.com.au',
  field: 'https://fieldatlas.com.au',
  corner: 'https://corneratlas.com.au',
  found: 'https://foundatlas.com.au',
  table: 'https://tableatlas.com.au',
}

// Vertical slug paths for venue pages
const VERTICAL_PATHS = {
  sba: '/venue',
  collection: '/venue',
  craft: '/venue',
  fine_grounds: '/venue',
  rest: '/stay',
  field: '/places',
  corner: '/shops',
  found: '/shops',
  table: '/listings',
}

// Human-readable vertical names
const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

// Simple in-memory rate limiter: max 60 requests per minute per IP
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 })
    return true
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) return false
  return true
}

// Periodically clean up stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip)
    }
  }
}, 300_000)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function GET(request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, {
      status: 429,
      headers: { ...CORS_HEADERS, 'Retry-After': '60' },
    })
  }

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat'))
  const lng = parseFloat(searchParams.get('lng'))
  const radiusParam = parseInt(searchParams.get('radius')) || 15
  const excludeVertical = searchParams.get('exclude_vertical') || ''
  const vertical = searchParams.get('vertical') || ''
  const limit = Math.min(parseInt(searchParams.get('limit')) || 6, 12)
  const limitPerVertical = Math.min(parseInt(searchParams.get('limit_per_vertical')) || 0, 6)
  // group_by_vertical=true returns { verticals: { sba: [...], ... } } instead of flat list
  const groupByVertical = searchParams.get('group_by_vertical') === 'true'

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400, headers: CORS_HEADERS })
  }

  const sb = getSupabaseAdmin()
  const excludeList = excludeVertical.split(',').filter(Boolean)

  // Adaptive radius: expand outward until we have enough results
  // Steps: 15 → 30 → 60 → 100km
  const RADIUS_STEPS = [15, 30, 60, 100]
  const HARD_CAP_KM = 100
  const adaptive = searchParams.get('adaptive') === 'true'
  const minResults = parseInt(searchParams.get('min_results')) || 0
  const maxPerVertical = parseInt(searchParams.get('max_per_vertical')) || 0

  // For non-adaptive requests, cap at requested radius (backward compat: old 30km cap)
  const effectiveMaxRadius = adaptive ? HARD_CAP_KM : Math.min(radiusParam, 30)

  // Calculate a bounding box for the initial query (rough filter)
  // 1 degree lat ~ 111km, 1 degree lng varies by latitude
  const maxRadius = HARD_CAP_KM
  const latDelta = maxRadius / 111
  const lngDelta = maxRadius / (111 * Math.cos(lat * Math.PI / 180))

  let query = sb
    .from('listings')
    .select(`id, name, slug, description, region, state, lat, lng, hero_image_url, vertical, sub_type, is_featured, is_claimed, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .gte('lat', lat - latDelta)
    .lte('lat', lat + latDelta)
    .gte('lng', lng - lngDelta)
    .lte('lng', lng + lngDelta)
    .limit(200)

  if (vertical) {
    query = query.eq('vertical', vertical)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  // Calculate distances and filter
  let results = (data || [])
    .filter(item => {
      if (excludeList.includes(item.vertical)) return false
      if (!item.lat || !item.lng) return false
      return true
    })
    .map(item => ({
      ...item,
      distance_km: Math.round(haversineKm(lat, lng, item.lat, item.lng) * 10) / 10,
      venue_url: `/place/${item.slug}`,
      image_url: item.hero_image_url,
    }))
    .sort((a, b) => {
      // Prefer featured/claimed, then by distance
      const aScore = (a.is_featured ? 2 : 0) + (a.is_claimed ? 1 : 0)
      const bScore = (b.is_featured ? 2 : 0) + (b.is_claimed ? 1 : 0)
      if (bScore !== aScore) return bScore - aScore
      return a.distance_km - b.distance_km
    })

  // Detect the region from the nearest listing (for header display)
  const nearestRegion = results.length > 0
    ? results.reduce((a, b) => a.distance_km < b.distance_km ? a : b).region
    : null

  // ── Adaptive radius expansion ──
  let radiusUsed = effectiveMaxRadius
  let filtered

  if (adaptive && minResults > 0) {
    // Walk through radius steps until we have enough results
    filtered = []
    for (const step of RADIUS_STEPS) {
      filtered = results.filter(r => r.distance_km <= step)
      radiusUsed = step
      if (filtered.length >= minResults) break
    }
  } else {
    // Legacy behavior: start with requested radius, expand to cap if sparse
    filtered = results.filter(r => r.distance_km <= effectiveMaxRadius)
    if (filtered.length < 3 && effectiveMaxRadius < 30) {
      radiusUsed = 30
      filtered = results.filter(r => r.distance_km <= 30)
    }
  }

  // If zero results within radius, return empty
  if (filtered.length === 0) {
    const emptyResponse = groupByVertical
      ? { verticals: {}, total: 0, radius_used: radiusUsed, region: nearestRegion }
      : { listings: [], total: 0, radius_used: radiusUsed, region: nearestRegion }
    return NextResponse.json(emptyResponse, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400', ...CORS_HEADERS },
    })
  }

  // Clean helper: strip internal fields before returning (keep lat/lng for trail suggestions)
  const cleanListing = ({ hero_image_url, is_featured, is_claimed, ...rest }) => rest

  // Grouped-by-vertical response
  if (groupByVertical) {
    const grouped = {}
    for (const item of filtered) {
      const v = item.vertical
      if (!grouped[v]) grouped[v] = []
      const perVertLimit = limitPerVertical || 3
      if (grouped[v].length < perVertLimit) {
        grouped[v].push(cleanListing(item))
      }
    }

    // Add vertical labels
    const verticals = {}
    for (const [key, items] of Object.entries(grouped)) {
      verticals[key] = {
        label: VERTICAL_LABELS[key] || key,
        listings: items,
      }
    }

    return NextResponse.json({
      verticals,
      total: filtered.length,
      radius_used: radiusUsed,
      region: nearestRegion,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400', ...CORS_HEADERS },
    })
  }

  // Flat response (original behaviour, with optional limit_per_vertical or round-robin)
  let finalListings

  if (maxPerVertical > 0) {
    // Cross-vertical round-robin diversification
    // Group candidates by vertical, then interleave picks
    const buckets = {}
    for (const item of filtered) {
      const v = item.vertical
      if (!buckets[v]) buckets[v] = []
      buckets[v].push(item)
    }
    const verticalKeys = Object.keys(buckets)
    finalListings = []
    let round = 0
    while (finalListings.length < limit && verticalKeys.length > 0) {
      const depleted = []
      for (const vk of verticalKeys) {
        if (finalListings.length >= limit) break
        const bucket = buckets[vk]
        const alreadyFromVertical = finalListings.filter(l => l.vertical === vk).length
        if (alreadyFromVertical >= maxPerVertical || round >= bucket.length) {
          depleted.push(vk)
          continue
        }
        finalListings.push(cleanListing(bucket[round]))
      }
      round++
      // Remove depleted verticals
      for (const d of depleted) {
        const idx = verticalKeys.indexOf(d)
        if (idx !== -1) verticalKeys.splice(idx, 1)
      }
      if (verticalKeys.length === 0) break
    }
    // If still short, fill with remaining (allow more per vertical)
    if (finalListings.length < limit) {
      const usedIds = new Set(finalListings.map(l => l.id))
      for (const item of filtered) {
        if (finalListings.length >= limit) break
        if (!usedIds.has(item.id)) {
          finalListings.push(cleanListing(item))
          usedIds.add(item.id)
        }
      }
    }
  } else if (limitPerVertical > 0) {
    const counts = {}
    finalListings = []
    for (const item of filtered) {
      const v = item.vertical
      counts[v] = (counts[v] || 0) + 1
      if (counts[v] <= limitPerVertical) {
        finalListings.push(cleanListing(item))
      }
      if (finalListings.length >= limit) break
    }
  } else {
    finalListings = filtered.slice(0, limit).map(cleanListing)
  }

  return NextResponse.json({
    listings: finalListings,
    total: filtered.length,
    radius_used: radiusUsed,
    region: nearestRegion,
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400', ...CORS_HEADERS },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}
