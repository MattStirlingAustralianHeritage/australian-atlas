/**
 * Trail recommendation engine — suggests next stops for the user-facing
 * trail builder given the stops already on the trail.
 *
 * Inputs are the current stop sequence (id/lat/lng/vertical) and optionally
 * the map viewport. Candidates are pulled from a corridor bounding box
 * around the trail, then blended-scored:
 *
 *   proximity  — exponential decay on distance to the nearest route leg
 *   vibe       — pgvector cosine similarity of the candidate against the
 *                mean embedding of the current stops (search_listings_geo RPC)
 *   quality    — curated listings.quality_score
 *   mix        — rewards verticals the trail doesn't have yet; penalises a
 *                fourth stop of the same kind; boosts missing "anchors"
 *                (coffee / food / overnight) the way plan-a-stay days do
 *   editorial  — small is_featured / editors_pick nudge
 *
 * With no stops yet, falls back to discovery mode: the strongest mixed-
 * vertical starting points inside the supplied viewport.
 *
 * Exclusions mirror /api/trails/search: inactive, address-on-request,
 * non-visitable (except by-appointment), and trail_suitable = false.
 */

const CANDIDATE_LIMIT = 300
const VIBE_LIMIT = 200
const QUALITY_FLOOR = 35

// Weights for the blended score. Proximity dominates — a perfect-vibe venue
// 200 km off-route is not a useful suggestion.
const W = { proximity: 0.38, vibe: 0.22, quality: 0.22, mix: 0.13, editorial: 0.05 }

const KM_PER_DEG_LAT = 111.32

function toRad(d) { return (d * Math.PI) / 180 }

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Distance from point P to segment AB on an equirectangular projection —
// accurate enough at trail scale (tens of km) and far cheaper than geodesics.
function pointToSegmentKm(p, a, b) {
  const midLat = toRad((a.lat + b.lat) / 2)
  const ax = a.lng * Math.cos(midLat), ay = a.lat
  const bx = b.lng * Math.cos(midLat), by = b.lat
  const px = p.lng * Math.cos(midLat), py = p.lat
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) * KM_PER_DEG_LAT
}

function corridorDistanceKm(candidate, stops) {
  const p = { lat: candidate.lat, lng: candidate.lng }
  if (stops.length === 1) return haversineKm(p.lat, p.lng, stops[0].lat, stops[0].lng)
  let min = Infinity
  for (let i = 0; i < stops.length - 1; i++) {
    const d = pointToSegmentKm(p, stops[i], stops[i + 1])
    if (d < min) min = d
  }
  return min
}

function trailBBox(stops, padDeg) {
  const lats = stops.map(s => s.lat), lngs = stops.map(s => s.lng)
  const pad = padDeg ?? Math.max(0.3, (Math.max(...lats) - Math.min(...lats)) * 0.35, (Math.max(...lngs) - Math.min(...lngs)) * 0.35)
  return {
    latMin: Math.min(...lats) - pad,
    latMax: Math.max(...lats) + pad,
    lngMin: Math.min(...lngs) - pad,
    lngMax: Math.max(...lngs) + pad,
  }
}

function totalLegsKm(stops) {
  let km = 0
  for (let i = 0; i < stops.length - 1; i++) {
    km += haversineKm(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng)
  }
  return km
}

/** Pull scored candidates inside a bbox via plain REST filters. */
async function fetchCandidates(sb, box, excludeIds) {
  let q = sb
    .from('listings')
    .select('id, name, slug, vertical, sub_type, region, state, suburb, lat, lng, hero_image_url, quality_score, is_featured')
    .eq('status', 'active')
    .gte('lat', box.latMin).lte('lat', box.latMax)
    .gte('lng', box.lngMin).lte('lng', box.lngMax)
    // quality_score 0 means "not yet scored", not "bad" — 733 active listings
    // (whole verticals in some regions) sit at 0. Deliberately-low scores
    // (1–34, gate-review material) stay excluded.
    .or(`quality_score.gte.${QUALITY_FLOOR},quality_score.eq.0`)
    .or('address_on_request.eq.false,address_on_request.is.null')
    .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
    .or('trail_suitable.eq.true,trail_suitable.is.null')
    .order('quality_score', { ascending: false })
    .limit(CANDIDATE_LIMIT)
  const { data, error } = await q
  if (error) throw error
  const skip = new Set((excludeIds || []).map(String))
  return (data || []).filter(l => l.lat != null && l.lng != null && !skip.has(String(l.id)))
}

/** Mean embedding of the current stops → similarity map via the geo RPC. */
async function fetchVibeScores(sb, stopIds, box) {
  try {
    const { data: rows, error } = await sb
      .from('listings')
      .select('id, embedding')
      .in('id', stopIds)
      .not('embedding', 'is', null)
    if (error || !rows?.length) return {}

    // Embeddings come back as JSON strings from PostgREST.
    const vectors = rows
      .map(r => (typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding))
      .filter(v => Array.isArray(v) && v.length)
    if (!vectors.length) return {}

    const dim = vectors[0].length
    const mean = new Array(dim).fill(0)
    for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i] / vectors.length

    const { data: similar, error: rpcError } = await sb.rpc('search_listings_geo', {
      query_embedding: JSON.stringify(mean),
      lat_min: box.latMin, lat_max: box.latMax,
      lng_min: box.lngMin, lng_max: box.lngMax,
      match_threshold: 0,
      match_count: VIBE_LIMIT,
    })
    if (rpcError || !similar) return {}
    const map = {}
    for (const s of similar) map[s.id] = s.similarity
    return map
  } catch {
    // Vibe scoring is best-effort — proximity/quality/mix carry the result.
    return {}
  }
}

// Anchor needs, in priority order. Mirrors the plan-a-stay day heuristics:
// every good day out has coffee early and food in the middle; long trails
// need somewhere to sleep.
function missingAnchors(stops, trailKm) {
  const verticals = new Set(stops.map(s => s.vertical))
  const anchors = []
  if (!verticals.has('fine_grounds')) {
    anchors.push({ vertical: 'fine_grounds', key: 'coffee', title: 'Add a coffee stop', reason: 'No coffee on this trail yet' })
  }
  if (!verticals.has('table')) {
    anchors.push({ vertical: 'table', key: 'food', title: 'Somewhere to eat', reason: 'No food stop yet' })
  }
  if (!verticals.has('rest') && (trailKm > 120 || stops.length >= 5)) {
    anchors.push({ vertical: 'rest', key: 'stay', title: 'Somewhere to stay', reason: `${Math.round(trailKm)} km is a big day — break it up` })
  }
  return anchors
}

function shapeItem(c, extras = {}) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    vertical: c.vertical,
    sub_type: c.sub_type || null,
    region: c.region || null,
    state: c.state || null,
    latitude: c.lat,
    longitude: c.lng,
    image_url: c.hero_image_url || null,
    // (internal quality_score is used for ranking but never shipped to the client)
    ...extras,
  }
}

/**
 * Corridor mode — the main path. `stops` have {id, lat, lng, vertical}.
 */
export async function recommendForTrail(sb, stops, { perGroup = 6 } = {}) {
  const valid = stops.filter(s => s.lat != null && s.lng != null)
  if (!valid.length) return { groups: [] }

  const box = trailBBox(valid)
  const trailKm = totalLegsKm(valid)
  const stopIds = valid.map(s => s.id)

  const [candidates, vibeScores] = await Promise.all([
    fetchCandidates(sb, box, stopIds),
    fetchVibeScores(sb, stopIds, box),
  ])
  if (!candidates.length) return { groups: [] }

  const verticalCounts = {}
  for (const s of valid) verticalCounts[s.vertical] = (verticalCounts[s.vertical] || 0) + 1
  const anchors = missingAnchors(valid, trailKm)
  const anchorVerticals = new Set(anchors.map(a => a.vertical))

  const scored = candidates.map(c => {
    const dKm = corridorDistanceKm(c, valid)
    const proximity = Math.exp(-dKm / 15)
    const vibe = vibeScores[c.id] ?? 0
    // Unscored (0) listings get a neutral quality, not a terrible one.
    const quality = (c.quality_score > 0 ? c.quality_score : 55) / 100
    let mix = 0
    if (!verticalCounts[c.vertical]) mix += 0.5
    if (anchorVerticals.has(c.vertical)) mix += 0.5
    if ((verticalCounts[c.vertical] || 0) >= 3) mix -= 0.4
    const editorial = c.is_featured ? 1 : 0
    const blended =
      W.proximity * proximity + W.vibe * vibe + W.quality * quality +
      W.mix * Math.max(0, Math.min(1, mix)) + W.editorial * editorial
    return { c, dKm, vibe, blended }
  })

  const used = new Set()
  const take = (pool, n) => {
    const out = []
    for (const s of pool) {
      if (used.has(String(s.c.id))) continue
      used.add(String(s.c.id))
      out.push(s)
      if (out.length >= n) break
    }
    return out
  }

  const groups = []

  // 1. Along your route — close to a leg, best blended score.
  const onRoute = take(
    scored.filter(s => s.dKm <= 20).sort((a, b) => b.blended - a.blended),
    perGroup
  )
  if (onRoute.length) {
    groups.push({
      key: 'route',
      title: valid.length === 1 ? 'Nearby' : 'Along your route',
      reason: valid.length === 1 ? `Close to ${valid[0].name || 'your first stop'}` : 'Little or no detour',
      items: onRoute.map(s => shapeItem(s.c, { distance_km: Math.round(s.dKm * 10) / 10 })),
    })
  }

  // 2. Missing anchor — the highest-priority gap in the day.
  const anchor = anchors[0]
  if (anchor) {
    const anchorItems = take(
      scored
        .filter(s => s.c.vertical === anchor.vertical && s.dKm <= 45)
        .sort((a, b) => b.blended - a.blended),
      Math.min(perGroup, 4)
    )
    if (anchorItems.length) {
      groups.push({
        key: anchor.key,
        title: anchor.title,
        reason: anchor.reason,
        items: anchorItems.map(s => shapeItem(s.c, { distance_km: Math.round(s.dKm * 10) / 10 })),
      })
    }
  }

  // 3. In the same spirit — vibe-led, can be a slightly bigger detour.
  const vibey = take(
    scored
      .filter(s => s.vibe > 0 && s.dKm <= 60)
      .sort((a, b) => (b.vibe * 0.7 + (b.c.quality_score ?? 0) / 100 * 0.3) - (a.vibe * 0.7 + (a.c.quality_score ?? 0) / 100 * 0.3)),
    perGroup
  )
  if (vibey.length) {
    groups.push({
      key: 'vibe',
      title: 'In the same spirit',
      reason: 'Matches the feel of your trail',
      items: vibey.map(s => shapeItem(s.c, { distance_km: Math.round(s.dKm * 10) / 10 })),
    })
  }

  return { groups, trail_km: Math.round(trailKm) }
}

/**
 * Discovery mode — no stops yet. Surfaces the strongest mixed-vertical
 * starting points inside the current map viewport.
 */
export async function recommendStarts(sb, bbox, { limit = 10 } = {}) {
  const [lngMin, latMin, lngMax, latMax] = bbox
  // A whole-country viewport isn't a useful "near you" signal — bail and let
  // the client show editorial templates instead.
  if (lngMax - lngMin > 25 || latMax - latMin > 20) return { groups: [] }

  const candidates = await fetchCandidates(sb, { latMin, latMax, lngMin, lngMax }, [])
  if (!candidates.length) return { groups: [] }

  // Round-robin across verticals so the opener isn't ten wineries.
  const byVertical = {}
  for (const c of candidates) {
    ;(byVertical[c.vertical] = byVertical[c.vertical] || []).push(c)
  }
  const order = Object.keys(byVertical).sort((a, b) => (byVertical[b][0]?.quality_score ?? 0) - (byVertical[a][0]?.quality_score ?? 0))
  const items = []
  for (let round = 0; items.length < limit && round < 6; round++) {
    for (const v of order) {
      const next = byVertical[v][round]
      if (next) items.push(next)
      if (items.length >= limit) break
    }
  }

  return {
    groups: [{
      key: 'start',
      title: 'Strong places to start',
      reason: 'The best-regarded venues in view',
      items: items.map(c => shapeItem(c)),
    }],
  }
}
