import { resolveRegionParam } from '@/lib/regions'

// ─────────────────────────────────────────────────────────────────
// The worked day on the homepage: ONE region's day per visit. A new
// region is drawn every hour, and every second hour draws from a
// region holding an operator-managed (claimed) listing, so the
// Standard showcase keeps appearing without the section carouselling.
// Every stop is a real listing rendered with its own writing, same
// gates the single worked trip used.
//
// Pool from the density query 2026-07-31 (active listings w/
// description+coords, ≥5 verticals represented). Regional areas
// lead — the old pool leaned urban — and the capitals give depth.
// A region that can't fill five slots is skipped and the next in
// the pool takes its turn.
// MATT: set DAY_REGION_OVERRIDE to a region name to pin every day
// to one region (stops still reshuffle hourly); edit the pool freely.
// ─────────────────────────────────────────────────────────────────
export const DAY_REGION_OVERRIDE = null
export const DAY_REGION_POOL = [
  'Margaret River',
  'Hobart & Southern Tasmania',
  'Yarra Valley',
  'Byron Bay',
  'Mornington Peninsula',
  'Blue Mountains',
  'Cairns & Tropical North',
  'Great Ocean Road',
  'Hunter Valley',
  'Gippsland',
  'Victorian High Country',
  'Barossa Valley',
  'Sunshine Coast Hinterland',
  'Launceston & Tamar Valley',
  'Daylesford & Hepburn Springs',
  'McLaren Vale',
  'Adelaide Hills',
  'Great Southern',
  'Cradle Country',
  'Orange',
  'Bendigo',
  'Canberra District',
  'Hobart City',
  'Ballarat & Goldfields',
  'Darwin & Top End',
  'Melbourne',
  'Sydney',
  'Perth',
  'Adelaide',
  'Brisbane',
  'Newcastle',
]

// Deterministic shuffle (same LCG the old weekly picks used): the
// same hour always draws the same day, so the cache and the page
// agree on what "this hour's day" is.
export function seededShuffle(arr, seed) {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Day order for a worked day: coffee, an activity before lunch,
// lunch, then ONE main activity for the afternoon, a tasting, a bed.
// Each slot takes the first vertical that still has an unused,
// well-described candidate, so the day degrades gracefully if the
// region thins out. A vertical is never used twice in one day.
// Labels are time-of-day, from the existing translated keys.
export const DAY_TRIP_SLOTS = [
  { slot: 'morning',    labelKey: 'clusterStopMorning',   prefs: [['fine_grounds'], ['table', ['bakery', 'market', 'providore']]] },
  { slot: 'midmorning', labelKey: 'tripStopMidMorning',   prefs: [['craft'], ['corner'], ['found'], ['collection'], ['field']] },
  { slot: 'midday',     labelKey: 'clusterStopMidday',    prefs: [['table', ['restaurant', 'cafe', 'bistro', 'pub', 'bakery']], ['table'], ['corner']] },
  // Way Atlas listings are deliberately left out of the worked-day
  // example (the afternoon reaches for the outdoors, then craft/culture
  // instead). The exclusion is also enforced at the query in
  // assembleRegionDay so no Way venue can slip into a stop.
  { slot: 'afternoon',  labelKey: 'clusterStopAfternoon', prefs: [['field'], ['collection'], ['craft'], ['corner']] },
  { slot: 'tasting',    labelKey: 'tripStopTasting',      prefs: [['sba'], ['fine_grounds']] },
  { slot: 'stay',       labelKey: 'clusterStopStay',      prefs: [['rest']] },
]

function toFinite(n) {
  const v = parseFloat(n)
  return Number.isFinite(v) ? v : null
}

export function pinWorthy(l) {
  return Boolean(l && l.slug && toFinite(l.lat) !== null && toFinite(l.lng) !== null &&
    l.visitable !== false && l.address_on_request !== true)
}

// Some older descriptions open with a street address before the prose
// starts. Preferring rows that open with prose is selection, not
// editing: whatever is picked still renders verbatim.
function descOpensWithAddress(d) {
  const head = String(d || '').slice(0, 90)
  return /\b\d{4}\b/.test(head) || /\bLot \d/i.test(head)
}

// Equirectangular distance, fine at region scale. Used to keep a
// worked day drivable: region resolution can reach a fair way out
// (the Margaret River region row includes Bunbury), and a "day" whose
// stops sit 80 km apart stops reading as one day.
function kmBetween(aLat, aLng, bLat, bLng) {
  const dLat = (aLat - bLat) * 111
  const dLng = (aLng - bLng) * 111 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
  return Math.hypot(dLat, dLng)
}
const TRIP_MAX_KM_FROM_CENTRE = 60

// One region's attempt at a day, filled slot by slot from its live
// listings. Descriptions render verbatim on the page, so a stop only
// qualifies when the portal row carries real writing (not just a
// name), real coordinates, and a live /place page. The seed shuffles
// the candidate pool, so the same region deals a different day each
// hour without ever loosening those gates.
//
// boostIds — listing ids to pull into the day when the region offers
// them (the claimed-listing showcase): boosted candidates sort to the
// front of their slot's pool and carry a distance *bonus* in the route
// search, so a claimed venue wins its slot whenever taking it doesn't
// wreck the day's geography.
export async function assembleRegionDay(sb, regionName, seed, boostIds = null) {
  const { region: resolved } = await resolveRegionParam(regionName)
  const fromTable = resolved ? 'listings_with_region' : 'listings'
  let query = sb
    .from(fromTable)
    .select('id, name, slug, vertical, sub_type, suburb, lat, lng, description, hero_image_url, is_claimed, visitable, address_on_request, trail_suitable')
    .eq('status', 'active')
    // Way Atlas experiences never appear in the worked-day example.
    .neq('vertical', 'way')
    // A worked-day stop must be trail-suitable: not a direct-sale producer,
    // appointment-only studio maker, or no-premises vendor (all visitable, but
    // not spontaneous stops). Accommodation (rest) is exempt — it fills the
    // overnight 'stay' slot, where trail_suitable=false is expected.
    .or('vertical.eq.rest,trail_suitable.eq.true,trail_suitable.is.null')
    .not('description', 'is', null)
    .not('slug', 'is', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .not('name', 'ilike', '\\_%')
    .limit(240)
  if (resolved) {
    query = query.eq('region_id', resolved.id)
  } else {
    query = query.eq('region', regionName)
  }
  const { data } = await query
  const boosted = (l) => Boolean(boostIds && boostIds.has(l.id))
  const usable = seededShuffle(
    (data || []).filter(l => pinWorthy(l) && String(l.description || '').trim().length > 80),
    seed
  )
    // Stable: boosted candidates surface to the front of the shuffled
    // order so the slot pools (capped at 10) never drop them.
    .sort((a, b) => Number(boosted(b)) - Number(boosted(a)))
  if (!usable.length) return null

  // The region's centre of gravity: where its listings actually are.
  // Group fall-through measures "in range" against this, so a slot
  // never reaches for a far corridor town while the core has options.
  const core = {
    lat: usable.reduce((s, l) => s + parseFloat(l.lat), 0) / usable.length,
    lng: usable.reduce((s, l) => s + parseFloat(l.lng), 0) / usable.length,
  }

  // Phase 1: resolve each slot to a small candidate pool. Distance
  // beats preference order: an earlier pref only wins with a candidate
  // inside driving range of the region core; only the slot's last
  // resort may reach further, so a thin region still fills its slots.
  const usedVerticals = new Set()
  const layers = []
  for (const { slot, labelKey, prefs } of DAY_TRIP_SLOTS) {
    for (let pi = 0; pi < prefs.length; pi++) {
      const [v, subTypes] = prefs[pi]
      if (usedVerticals.has(v)) continue
      let candidates = usable.filter(l =>
        l.vertical === v && (!subTypes || subTypes.includes(l.sub_type))
      )
      if (!candidates.length) continue
      const near = candidates.filter(l =>
        kmBetween(parseFloat(l.lat), parseFloat(l.lng), core.lat, core.lng) <= TRIP_MAX_KM_FROM_CENTRE
      )
      if (!near.length && pi < prefs.length - 1) continue
      if (near.length) candidates = near
      usedVerticals.add(v)
      // Pools stay vertical-disjoint (usedVerticals), so no venue can
      // serve two slots. Cap for the route search below; the seeded
      // shuffle above is what varies the pool hour to hour.
      layers.push({ slot, labelKey, pool: candidates.slice(0, 10) })
      break
    }
  }
  if (layers.length < 5) return null

  // Phase 2: the day visits its slots in time order, so the only way
  // to avoid the route doubling back on itself is choosing WHICH
  // venue serves each slot. Pick the combination with the shortest
  // slot-ordered chain (one venue per layer, shortest-path over the
  // layered graph): backtracking is wasted distance, so the minimal
  // chain doubles back only when the region leaves no alternative.
  // Address-fronted descriptions carry a phantom-distance penalty so
  // the prose-first preference survives inside the route search; a
  // boosted (claimed) candidate carries a bonus twice the drivable
  // radius would ever justify, so it wins unless it's truly remote.
  const qualityPenaltyKm = (l) =>
    (descOpensWithAddress(l.description) ? 12 : 0) - (boosted(l) ? 30 : 0)
  const dist = layers.map(() => [])
  const back = layers.map(() => [])
  layers[0].pool.forEach((l, j) => { dist[0][j] = qualityPenaltyKm(l); back[0][j] = -1 })
  for (let i = 1; i < layers.length; i++) {
    layers[i].pool.forEach((cand, j) => {
      let best = Infinity
      let bestPrev = 0
      layers[i - 1].pool.forEach((prev, k) => {
        const d = dist[i - 1][k] + kmBetween(
          parseFloat(prev.lat), parseFloat(prev.lng),
          parseFloat(cand.lat), parseFloat(cand.lng)
        )
        if (d < best) { best = d; bestPrev = k }
      })
      dist[i][j] = best + qualityPenaltyKm(cand)
      back[i][j] = bestPrev
    })
  }
  const last = layers.length - 1
  let j = dist[last].indexOf(Math.min(...dist[last]))
  const picks = []
  for (let i = last; i >= 0; i--) {
    picks[i] = layers[i].pool[j]
    j = back[i][j]
  }
  const stops = layers.map((layer, i) => ({ ...picks[i], slot: layer.slot, labelKey: layer.labelKey }))
  return {
    region: regionName,
    regionSlug: resolved?.slug || null,
    hasClaimed: stops.some(s => s.is_claimed),
    stops,
  }
}

// The claimed-listing index for the showcase: which regions hold a
// usable claimed venue, and which ids to boost. Claimed venues are
// what a Standard listing looks like on the atlas, so every second
// day in the hand tries to carry one.
async function fetchClaimedIndex(sb) {
  try {
    const { data } = await sb
      .from('listings')
      .select('id, region, description, lat, lng, slug, visitable, address_on_request, trail_suitable, vertical')
      .eq('status', 'active')
      .eq('is_claimed', true)
      .neq('vertical', 'way')
      .not('description', 'is', null)
      .not('slug', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .not('name', 'ilike', '\\_%')
      .limit(500)
    const usable = (data || []).filter(l =>
      pinWorthy(l) &&
      String(l.description || '').trim().length > 80 &&
      (l.trail_suitable !== false || l.vertical === 'rest')
    )
    const byRegion = new Map()
    for (const l of usable) {
      if (!l.region) continue
      if (!byRegion.has(l.region)) byRegion.set(l.region, [])
      byRegion.get(l.region).push(l.id)
    }
    return { ids: new Set(usable.map(l => l.id)), byRegion }
  } catch {
    return { ids: new Set(), byRegion: new Map() }
  }
}

// The day for this hour: one region, drawn from a seeded shuffle of
// the pool so consecutive hours sample the whole spread — which is
// mostly regional by construction. Every second hour is a "showcase"
// draw from the regions holding a claimed venue, with that venue
// boosted into the route: the reader meets an operator-managed
// (Standard) listing roughly every other visit. A region that can't
// fill five slots is skipped and the next in the order takes the hour.
export async function buildHomeDay(sb, hourSeed) {
  const pool = DAY_REGION_OVERRIDE ? [DAY_REGION_OVERRIDE] : DAY_REGION_POOL
  const claimed = DAY_REGION_OVERRIDE
    ? { ids: new Set(), byRegion: new Map() }
    : await fetchClaimedIndex(sb)
  const showcasePool = pool.filter(r => (claimed.byRegion.get(r) || []).length > 0)

  const generalOrder = seededShuffle(pool, (hourSeed * 2654435761 + 97) & 0x7fffffff)
  const showcaseOrder = seededShuffle(showcasePool, (hourSeed * 2246822519 + 31) & 0x7fffffff)
  const wantShowcase = hourSeed % 2 === 1 && showcaseOrder.length > 0

  // Showcase hours try the claimed-holding regions first, then fall
  // through to the rest of the pool rather than rendering nothing.
  const order = wantShowcase
    ? [...showcaseOrder, ...generalOrder.filter(r => !showcaseOrder.includes(r))]
    : generalOrder

  for (const regionName of order) {
    const day = await assembleRegionDay(
      sb, regionName, hourSeed,
      wantShowcase ? claimed.ids : null
    )
    if (day) return day
  }
  return null
}
