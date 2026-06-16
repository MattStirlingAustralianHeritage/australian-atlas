/**
 * OpenStreetMap Overpass — a quota-free candidate discovery source.
 *
 * Why this exists: the prospector's original (and only) discovery source was the
 * Google Places API. When that project's billing/quota lapses, every Places call
 * returns OVER_QUERY_LIMIT, discovery returns nothing, and the entire candidate
 * queue starves (all verticals fall to zero). Google Places is a single point of
 * failure with an external dependency we don't fully control.
 *
 * OpenStreetMap's Overpass API is free, keyless, has no daily quota, and carries
 * rich Australian POI coverage with real `website` tags. Every venue returned is
 * a real, crowd-verified place — nothing is invented. Candidates discovered here
 * run through the EXACT SAME 5-gate pipeline (web presence, geocode, activity,
 * Claude vertical-fit) as Google Places candidates, so the quality bar is
 * identical; only the seed list of names+websites comes from a different source.
 *
 * Used by lib/prospector/replenish.js as the primary discovery source, with
 * Google Places kept as an optional top-up for when its quota is healthy.
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

// State bounding boxes as Overpass expects them: (south, west, north, east).
// Derived from the same STATE_BOUNDS used by Gate 2; rectangular boxes overlap
// at borders, which is harmless — Gate 0 dedups and Gate 2 verifies the real
// state from coordinates.
export const OSM_STATE_BBOX = {
  NSW: [-37.5, 141.0, -28.2, 153.6],
  VIC: [-39.2, 140.9, -34.0, 150.0],
  QLD: [-29.2, 138.0, -10.7, 153.5],
  SA: [-38.1, 129.0, -26.0, 141.0],
  WA: [-35.2, 112.9, -13.7, 129.0],
  TAS: [-43.7, 143.8, -39.6, 148.4],
  ACT: [-35.9, 148.7, -35.1, 149.4],
  NT: [-26.0, 129.0, -10.9, 138.0],
  AU: [-44.0, 112.0, -10.0, 154.0],
}

// Per-vertical OSM tag selectors (`key=value`). These are a deliberately broad
// PRE-filter: the strict editorial definition is enforced downstream by Gate 4
// (Claude). Over-inclusion is fine (Gate 4 rejects mismatches); the only failure
// mode to avoid is under-inclusion, which would starve supply.
export const OSM_SELECTORS = {
  sba: ['craft=brewery', 'craft=winery', 'craft=distillery', 'craft=cider', 'microbrewery=yes', 'amenity=winery'],
  collection: ['tourism=museum', 'tourism=gallery', 'amenity=arts_centre'],
  craft: ['craft=pottery', 'craft=potter', 'craft=ceramics', 'craft=jeweller', 'craft=glassblower', 'craft=weaver', 'craft=basket_maker', 'craft=leather', 'craft=engraver', 'craft=sculptor', 'craft=artist', 'craft=woodworker', 'shop=craft'],
  fine_grounds: ['craft=coffee_roaster', 'shop=coffee'],
  rest: ['tourism=hotel', 'tourism=guest_house', 'tourism=chalet', 'tourism=apartment'],
  field: ['leisure=nature_reserve', 'boundary=national_park', 'boundary=protected_area', 'tourism=attraction'],
  corner: ['shop=books', 'shop=gift', 'shop=art', 'shop=interior_decoration', 'shop=music', 'shop=stationery', 'shop=frame', 'shop=houseware'],
  found: ['shop=antiques', 'shop=second_hand', 'shop=charity'],
  table: ['amenity=restaurant', 'amenity=cafe', 'shop=bakery', 'amenity=marketplace', 'shop=deli', 'shop=farm'],
}

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

/**
 * POST a query to Overpass with endpoint rotation and 429/504 backoff.
 * Public Overpass instances rate-limit aggressively; this rotates across mirrors
 * and backs off so transient throttling doesn't read as "no supply".
 */
async function overpassQuery(ql, { deadlineMs = null, log = () => {} } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (deadlineMs && Date.now() >= deadlineMs) return { elements: [], timedOut: true }
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length]
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 95000)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'AustralianAtlas/1.0 (candidate-discovery; +https://www.australianatlas.com.au)',
        },
        body: 'data=' + encodeURIComponent(ql),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.status === 429 || res.status === 504) {
        log(`[osm] ${endpoint} ${res.status} — backing off`)
        await new Promise(r => setTimeout(r, 2500 * (attempt + 1)))
        continue
      }
      if (!res.ok) {
        log(`[osm] ${endpoint} HTTP ${res.status}`)
        continue
      }
      const data = await res.json()
      // Overpass signals a server-side timeout/limit with a 200 + `remark`.
      if (data.remark && /timed out|out of memory|please reduce/i.test(data.remark)) {
        log(`[osm] remark: ${data.remark} — retrying lighter`)
        await new Promise(r => setTimeout(r, 1500))
        continue
      }
      return { elements: data.elements || [], remark: data.remark || null }
    } catch (err) {
      log(`[osm] ${endpoint} ${err.name === 'AbortError' ? 'timeout' : err.message}`)
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  return { elements: [], failed: true }
}

function buildQuery(selectors, bbox, { maxResults = 150 } = {}) {
  const box = bbox.join(',')
  // Only POIs that carry a `website` tag — this both gives us the verified URL
  // every gate downstream needs and slashes result volume for dense verticals.
  const statements = selectors.map(sel => {
    const [k, v] = sel.split('=')
    return `nwr["${k}"="${v}"]["website"](${box});`
  }).join('')
  return `[out:json][timeout:90];(${statements});out tags center ${maxResults};`
}

function osmState(tags, lat, lng) {
  const tagState = (tags['addr:state'] || '').toUpperCase().replace(/\s+/g, '')
  if (OSM_STATE_BBOX[tagState]) return tagState
  // Derive from coordinates (point-in-bbox; first match wins).
  for (const [code, b] of Object.entries(OSM_STATE_BBOX)) {
    if (code === 'AU') continue
    const [s, w, n, e] = b
    if (lat >= s && lat <= n && lng >= w && lng <= e) return code
  }
  return null
}

function osmRegion(tags, stateCode) {
  return (
    tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] ||
    tags['addr:municipality'] || tags['addr:village'] ||
    (stateCode ? STATE_NAMES[stateCode] : null) || null
  )
}

function osmAddress(tags) {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'] || tags['addr:city'] || tags['addr:town'],
    tags['addr:state'],
    tags['addr:postcode'],
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/**
 * Discover candidates for one vertical within one area (a state code, or 'AU').
 * Returns candidate objects in the same shape as google-places discoverCandidates,
 * ready for the dedup pre-filter + 5-gate pipeline in replenishVertical.
 *
 * @param {string} vertical
 * @param {string} area - state code ('NSW'…'NT') or 'AU'
 * @param {object} opts - { maxResults, deadlineMs, log }
 * @returns {Promise<object[]>}
 */
export async function discoverFromOSM(vertical, area, opts = {}) {
  const { maxResults = 150, deadlineMs = null, log = () => {} } = opts
  const selectors = OSM_SELECTORS[vertical]
  if (!selectors) return []
  const bbox = OSM_STATE_BBOX[area] || OSM_STATE_BBOX.AU
  if (deadlineMs && Date.now() >= deadlineMs) return []

  const ql = buildQuery(selectors, bbox, { maxResults })
  const { elements } = await overpassQuery(ql, { deadlineMs, log })

  const seen = new Set()
  const candidates = []
  for (const el of elements) {
    const tags = el.tags || {}
    const name = (tags.name || '').trim()
    const website = tags.website || tags['contact:website'] || tags.url || null
    if (!name || !website) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const lat = el.lat ?? el.center?.lat ?? null
    const lng = el.lon ?? el.center?.lng ?? el.center?.lon ?? null
    const stateCode = lat != null && lng != null ? osmState(tags, lat, lng) : (area !== 'AU' ? area : null)
    const matchedTag = selectors.find(sel => {
      const [k, v] = sel.split('=')
      return tags[k] === v
    }) || 'osm'

    candidates.push({
      name,
      region: osmRegion(tags, stateCode),
      state: stateCode || (area !== 'AU' ? area : null),
      vertical,
      website_url: website,
      source: 'osm_overpass',
      source_detail: `OpenStreetMap — ${matchedTag}`,
      notes: [
        `OSM ${el.type}/${el.id}`,
        tags['opening_hours'] ? 'Has opening hours' : null,
      ].filter(Boolean).join('. '),
      status: 'pending',
      google_places_data: null,
      lat,
      lng,
      phone: tags.phone || tags['contact:phone'] || null,
      address: osmAddress(tags),
    })
  }
  log(`[osm] ${vertical} @ ${area}: ${elements.length} elements → ${candidates.length} named+website candidates`)
  return candidates
}

/**
 * Lightweight availability probe — a tiny query that confirms Overpass is
 * reachable right now. Used so callers can fail fast / report status.
 */
export async function probeOSM() {
  const ql = `[out:json][timeout:25];nwr["craft"="brewery"]["website"](-38.0,144.8,-37.6,145.2);out tags center 3;`
  const { elements, failed } = await overpassQuery(ql, { log: () => {} })
  return { available: !failed && elements.length >= 0, sample: elements.length }
}
