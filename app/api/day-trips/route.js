import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'

// ── Math helpers ──────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

// ── Constants ─────────────────────────────────────────────────

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_ACTIVITIES = {
  sba: 'producers and tastings',
  collection: 'culture and heritage',
  craft: 'makers and studios',
  fine_grounds: 'coffee and cafes',
  field: 'nature and outdoors',
  corner: 'local makers',
  found: 'vintage and antiques',
  table: 'dining',
}

const DIRECTION_LABELS = {
  0: 'north', 45: 'northeast', 90: 'east', 135: 'southeast',
  180: 'south', 225: 'southwest', 270: 'west', 315: 'northwest',
}

const RADIUS_STEPS = [30, 45, 60, 80, 100]

// ── Rate limiter (1 request per 10s per IP) ───────────────────

const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX = 1

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

setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip)
    }
  }
}, 60_000)

// ── Helpers ───────────────────────────────────────────────────

/**
 * Find the compass direction label closest to a bearing.
 */
function directionLabel(bearing) {
  const dirs = [
    [0, 'north'], [45, 'northeast'], [90, 'east'], [135, 'southeast'],
    [180, 'south'], [225, 'southwest'], [270, 'west'], [315, 'northwest'], [360, 'north'],
  ]
  let best = dirs[0]
  let minDiff = 999
  for (const [deg, label] of dirs) {
    const diff = Math.abs(bearing - deg)
    if (diff < minDiff) { minDiff = diff; best = [deg, label] }
  }
  return best[1]
}

/**
 * Generate a human-readable theme for a day's stops.
 */
function generateTheme(stops) {
  if (!stops || stops.length === 0) return 'Exploring the area'

  // Count verticals
  const vertCounts = {}
  for (const s of stops) {
    vertCounts[s.vertical] = (vertCounts[s.vertical] || 0) + 1
  }

  const sorted = Object.entries(vertCounts).sort((a, b) => b[1] - a[1])
  const dominant = sorted[0]?.[0]
  const secondary = sorted[1]?.[0]

  // Get region context from stops
  const regionCounts = {}
  for (const s of stops) {
    if (s.region) regionCounts[s.region] = (regionCounts[s.region] || 0) + 1
  }
  const topRegion = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

  // If all one vertical
  if (sorted.length === 1 || sorted[0][1] >= stops.length - 1) {
    const activity = VERTICAL_ACTIVITIES[dominant] || 'local places'
    if (topRegion) return `A day of ${activity} around ${topRegion}`
    return `A day of ${activity}`
  }

  // Two dominant verticals
  const act1 = VERTICAL_ACTIVITIES[dominant] || dominant
  const act2 = VERTICAL_ACTIVITIES[secondary] || secondary

  // Capitalize first letter of each
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
  const label1 = cap(act1.split(' ')[0])
  const label2 = cap(act2.split(' ')[0])

  if (topRegion) return `${label1} and ${label2.toLowerCase()} around ${topRegion}`
  return `${label1} and ${label2.toLowerCase()}`
}

/**
 * Select stops with round-robin vertical diversity.
 * Prefers claimed/featured listings and preference-matched verticals.
 */
function selectStops(candidates, preferences, target = 4) {
  if (candidates.length <= target) return [...candidates]

  // Preference vertical boost
  const prefVerticals = new Set()
  const PREF_MAP = {
    cellar_doors: ['sba'], great_coffee: ['fine_grounds'], nature: ['field'],
    culture: ['collection'], craft_beer: ['craft'], vintage: ['found'],
    dining: ['table'], shopping: ['corner', 'found'],
    local_makers: ['craft', 'corner'], outdoors: ['field'],
  }
  for (const p of (preferences || [])) {
    for (const v of (PREF_MAP[p] || [])) prefVerticals.add(v)
  }

  // Score each candidate
  for (const c of candidates) {
    c._score = 0
    if (c.is_claimed) c._score += 3
    if (c.is_featured) c._score += 2
    if (c.editors_pick) c._score += 1
    if (prefVerticals.has(c.vertical)) c._score += 4
    // Slight distance penalty (prefer closer within sector)
    c._score -= c.distance_km * 0.02
  }

  // Group by vertical
  const buckets = {}
  for (const c of candidates) {
    if (!buckets[c.vertical]) buckets[c.vertical] = []
    buckets[c.vertical].push(c)
  }

  // Sort each bucket by score descending
  for (const v of Object.keys(buckets)) {
    buckets[v].sort((a, b) => b._score - a._score)
  }

  // Round-robin pick
  const selected = []
  const usedIds = new Set()
  const verticals = Object.keys(buckets)
  let round = 0

  while (selected.length < target && verticals.length > 0) {
    const exhausted = []
    for (let i = 0; i < verticals.length && selected.length < target; i++) {
      const v = verticals[i]
      const bucket = buckets[v]
      if (bucket.length === 0) { exhausted.push(i); continue }
      const pick = bucket.shift()
      if (!usedIds.has(pick.id)) {
        usedIds.add(pick.id)
        selected.push(pick)
      }
    }
    // Remove exhausted verticals (reverse to keep indices valid)
    for (const idx of exhausted.reverse()) verticals.splice(idx, 1)
    round++
    if (round > 20) break // safety
  }

  return selected
}

/**
 * Divide candidates into N angular sectors and find the best rotation
 * to maximize Day 1 density and overall balance.
 */
function assignSectors(candidates, numDays, baseLat, baseLng) {
  const sectorSize = 360 / numDays

  // Test 36 rotations (every 10 degrees) to find optimal alignment
  let bestOffset = 0
  let bestScore = -Infinity

  for (let offset = 0; offset < 360; offset += 10) {
    const counts = new Array(numDays).fill(0)
    for (const c of candidates) {
      const adjusted = (c.bearing - offset + 360) % 360
      const sector = Math.min(Math.floor(adjusted / sectorSize), numDays - 1)
      counts[sector]++
    }
    // Score: day 1 density * 2 + min(day counts) * 3 + total balance
    const minCount = Math.min(...counts)
    const score = counts[0] * 2 + minCount * 3 + counts.reduce((a, b) => a + b, 0) * 0.1
    if (score > bestScore) {
      bestScore = score
      bestOffset = offset
    }
  }

  // Assign candidates to sectors using best offset
  const sectors = Array.from({ length: numDays }, () => [])
  for (const c of candidates) {
    const adjusted = (c.bearing - bestOffset + 360) % 360
    const sector = Math.min(Math.floor(adjusted / sectorSize), numDays - 1)
    sectors[sector].push(c)
  }

  // Build sector metadata
  const sectorMeta = sectors.map((_, i) => {
    const startDeg = (bestOffset + i * sectorSize) % 360
    const endDeg = (bestOffset + (i + 1) * sectorSize) % 360
    const midDeg = (startDeg + sectorSize / 2) % 360
    return { startDeg, endDeg, midDeg, direction: directionLabel(midDeg) }
  })

  // Sort Day 1 by closest distance (easy intro day)
  if (sectors[0]) sectors[0].sort((a, b) => a.distance_km - b.distance_km)

  return { sectors, sectorMeta, offset: bestOffset }
}

/**
 * Calculate total loop distance: base → stops in order → back to base.
 */
function calculateLoopDistance(baseLat, baseLng, stops) {
  if (stops.length === 0) return 0
  let total = haversineKm(baseLat, baseLng, stops[0].lat, stops[0].lng)
  for (let i = 1; i < stops.length; i++) {
    total += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng)
  }
  total += haversineKm(stops[stops.length - 1].lat, stops[stops.length - 1].lng, baseLat, baseLng)
  return total
}

// ── Main handler ──────────────────────────────────────────────

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Please wait a moment before generating another trip.' },
      { status: 429, headers: { 'Retry-After': '10' } }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    base_listing_id,
    num_days = 3,
    max_radius_km = 60,
    travel_mode = 'drive',
    preferences = [],
  } = body

  if (!base_listing_id) {
    return NextResponse.json({ error: 'base_listing_id is required' }, { status: 400 })
  }

  const days = Math.max(1, Math.min(7, parseInt(num_days) || 3))
  const maxRadius = Math.max(15, Math.min(100, parseInt(max_radius_km) || 60))

  const sb = getSupabaseAdmin()

  // ── 1. Fetch base listing ──

  const { data: base, error: baseErr } = await sb
    .from('listings')
    .select('id, name, slug, lat, lng, region, state, vertical, status, hero_image_url')
    .eq('id', base_listing_id)
    .single()

  if (baseErr || !base) {
    return NextResponse.json({ error: 'Base listing not found' }, { status: 404 })
  }

  if (base.vertical !== 'rest') {
    return NextResponse.json({ error: 'Base listing must be an accommodation (Rest Atlas)' }, { status: 400 })
  }

  if (base.status !== 'active') {
    return NextResponse.json({ error: 'Base listing is not active' }, { status: 400 })
  }

  if (!base.lat || !base.lng) {
    return NextResponse.json({ error: 'Base listing has no coordinates' }, { status: 400 })
  }

  // ── 2. Query all candidate listings within max radius ──

  // Bounding box filter (rough), then precise haversine
  const queryRadius = Math.max(maxRadius, 100) // always query at 100km for thin-coverage fallback
  const latDelta = queryRadius / 111
  const lngDelta = queryRadius / (111 * Math.cos(base.lat * Math.PI / 180))

  const { data: rawCandidates, error: queryErr } = await sb
    .from('listings')
    .select('id, name, slug, description, region, state, lat, lng, vertical, sub_type, hero_image_url, is_featured, is_claimed, editors_pick, quality_score')
    .eq('status', 'active')
    .gte('lat', base.lat - latDelta)
    .lte('lat', base.lat + latDelta)
    .gte('lng', base.lng - lngDelta)
    .lte('lng', base.lng + lngDelta)
    .neq('id', base.id)
    .limit(500)

  if (queryErr) {
    console.error('[day-trips] Query error:', queryErr.message)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // ── 3. Compute distance + bearing, filter by radius ──

  const allCandidates = (rawCandidates || [])
    .filter(c => c.lat && c.lng && c.vertical !== 'rest')
    .map(c => ({
      ...c,
      distance_km: Math.round(haversineKm(base.lat, base.lng, c.lat, c.lng) * 10) / 10,
      bearing: bearingDeg(base.lat, base.lng, c.lat, c.lng),
      description_snippet: c.description ? c.description.slice(0, 120) : null,
    }))

  // Adaptive radius: try maxRadius first, expand if too sparse
  let radiusUsed = maxRadius
  let candidates = allCandidates.filter(c => c.distance_km <= maxRadius)

  // Minimum viable: need at least 2 candidates per day
  const minNeeded = days * 2
  if (candidates.length < minNeeded) {
    for (const step of RADIUS_STEPS) {
      if (step <= maxRadius) continue
      candidates = allCandidates.filter(c => c.distance_km <= step)
      radiusUsed = step
      if (candidates.length >= minNeeded) break
    }
  }

  if (candidates.length < 2) {
    return NextResponse.json({
      error: 'insufficient_coverage',
      message: `Only ${candidates.length} listing${candidates.length !== 1 ? 's' : ''} found within ${radiusUsed}km. This area may not have enough coverage yet.`,
      total_in_range: candidates.length,
    })
  }

  // ── 4. Angular sectoring ──

  const { sectors, sectorMeta } = assignSectors(candidates, days, base.lat, base.lng)

  // ── 5. Build each day ──

  const usedIds = new Set()
  const resultDays = []
  const thinCoverageDays = []

  for (let d = 0; d < days; d++) {
    let sectorCandidates = sectors[d].filter(c => !usedIds.has(c.id))

    // Thin coverage: widen sector or expand radius
    let coverage = 'good'
    if (sectorCandidates.length < 2) {
      // Try widening: borrow from adjacent sectors
      const prev = sectors[(d - 1 + days) % days] || []
      const next = sectors[(d + 1) % days] || []
      const borrowed = [...prev, ...next]
        .filter(c => !usedIds.has(c.id))
        .sort((a, b) => a.distance_km - b.distance_km)
      sectorCandidates = [...sectorCandidates, ...borrowed]
      coverage = sectorCandidates.length < 2 ? 'thin' : 'expanded'
    }

    if (sectorCandidates.length === 0) {
      thinCoverageDays.push(d + 1)
      continue
    }

    // Select 3-5 stops with vertical diversity
    const targetStops = d === 0 ? 4 : Math.min(5, Math.max(3, sectorCandidates.length))
    const selected = selectStops(sectorCandidates, preferences, targetStops)

    // Mark as used
    for (const s of selected) usedIds.add(s.id)

    // Order as loop: sort by bearing clockwise for circuit
    selected.sort((a, b) => a.bearing - b.bearing)

    // Calculate loop distance
    const totalDistanceKm = Math.round(calculateLoopDistance(base.lat, base.lng, selected) * 10) / 10

    // Estimate drive time: 50 km/h average with 1.3x road factor
    const estimatedDriveMinutes = Math.round(totalDistanceKm / 50 * 60 * 1.3)

    // Generate theme
    const theme = generateTheme(selected)

    resultDays.push({
      day_number: d + 1,
      theme,
      direction: sectorMeta[d].direction,
      sector: { start_deg: sectorMeta[d].startDeg, end_deg: sectorMeta[d].endDeg },
      total_distance_km: totalDistanceKm,
      estimated_drive_minutes: estimatedDriveMinutes,
      coverage,
      stops: selected.map((s, i) => ({
        listing_id: s.id,
        name: s.name,
        slug: s.slug,
        lat: s.lat,
        lng: s.lng,
        vertical: s.vertical,
        vertical_label: VERTICAL_LABELS[s.vertical] || s.vertical,
        sub_type: s.sub_type || null,
        region: s.region || null,
        description_snippet: s.description_snippet,
        distance_from_base_km: s.distance_km,
        bearing_from_base_deg: Math.round(s.bearing),
        hero_image_url: s.hero_image_url || null,
        order_index: i,
      })),
    })
  }

  // ── 6. Build response ──

  const tripId = crypto.randomUUID()

  const coverageNote = resultDays.length < days
    ? `We found enough for ${resultDays.length} good day${resultDays.length === 1 ? '' : 's'} from here. Check back as we add more listings.`
    : null

  return NextResponse.json({
    trip_id: tripId,
    base: {
      id: base.id,
      name: base.name,
      slug: base.slug,
      lat: base.lat,
      lng: base.lng,
      region: base.region,
      state: base.state,
      vertical: base.vertical,
      hero_image_url: base.hero_image_url,
    },
    days: resultDays,
    thin_coverage_days: thinCoverageDays,
    coverage_note: coverageNote,
    total_listings_in_range: candidates.length,
    radius_used_km: radiusUsed,
    num_days_requested: days,
    travel_mode,
  }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
