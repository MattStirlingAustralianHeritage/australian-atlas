import LocalizedLink from '@/components/LocalizedLink'
import { unstable_cache } from 'next/cache'
import { getTranslations, getLocale } from 'next-intl/server'
import { localizePath, PREFIXED_LOCALES } from '@/lib/i18n/config'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import HomeAtlasMap from '@/components/HomeAtlasMap'
import NewsletterSignup from '@/components/NewsletterSignup'
import ScrollReveal from '@/components/ScrollReveal'
import DiscoverDeck from '@/components/discover/DiscoverDeck'
import TrailMap from '@/app/trails/[slug]/TrailMap'
import { resolveRegionParam } from '@/lib/regions'
import { buildContours } from '@/lib/discover/contours'
import { getPublicVerticals, getVerticalBadge, getVerticalTagline, VERTICAL_ACCENTS, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { subTypeLabel } from '@/lib/subTypeLabels'
import { buildTypeCounterEntries } from '@/lib/home/typeCounter'
import { Coffee, Wine, UtensilsCrossed, BedDouble, Mountain, Compass, Hammer, Landmark, ShoppingBag, Clock } from 'lucide-react'

export const revalidate = 1800

// Home canonical: locale-aware self-canonical plus hreflang alternates, matching
// the /place/[slug] convention (middleware Link headers cover the rest of the site).
export async function generateMetadata() {
  const locale = await getLocale()
  const base = 'https://www.australianatlas.com.au'
  const languages = { en: `${base}${localizePath('/', 'en')}` }
  for (const loc of PREFIXED_LOCALES) languages[loc] = `${base}${localizePath('/', loc)}`
  languages['x-default'] = `${base}${localizePath('/', 'en')}`
  return {
    alternates: { canonical: `${base}${localizePath('/', locale)}`, languages },
  }
}

const GOLD = 'var(--color-gold)'

// ─────────────────────────────────────────────────────────────────
// The worked-trip hero. A new hypothetical day is drawn every hour:
// the hour picks a region from the pool below, and seeds the shuffle
// that fills its slots, so returning visitors see a different real
// day each hour. A region that can't fill five slots is skipped and
// the next in the pool takes its hour.
// Pool from the density query 2026-07-12 (active listings w/
// description+coords), regional first for the trip framing, capitals
// as depth: Melbourne 435 / Sydney 367 / Perth 360 / Adelaide 358 /
// Margaret River 166 / Hobart & Sthn Tas 162 / Cairns & TN 140 /
// Yarra Valley 128 / Canberra District 124 / Bendigo 117 /
// Hobart City 105 / Byron Bay 105.
// MATT: set HERO_REGION_OVERRIDE to a region name to pin one region
// (stops still reshuffle hourly); edit the pool freely.
// ─────────────────────────────────────────────────────────────────
const HERO_REGION_OVERRIDE = null
const HERO_REGION_POOL = [
  'Margaret River',
  'Hobart & Southern Tasmania',
  'Yarra Valley',
  'Byron Bay',
  'Cairns & Tropical North',
  'Bendigo',
  'Canberra District',
  'Hobart City',
  'Melbourne',
  'Sydney',
  'Perth',
  'Adelaide',
  'Brisbane',
]

// One value per hour, computed outside the cache and passed in, so it
// participates in the cache key and the whole payload turns over on
// the hour.
function getHourSeed() {
  return Math.floor(Date.now() / (60 * 60 * 1000))
}

// Deterministic shuffle (same LCG the old weekly picks used): the
// same hour always draws the same day, so the cache and the page
// agree on what "this hour's route" is.
function seededShuffle(arr, seed) {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Day order for the worked trip: coffee, an activity before lunch,
// lunch, then ONE main activity for the afternoon, a tasting, a bed.
// Each slot takes the first vertical that still has an unused,
// well-described candidate, so the trip degrades gracefully if the
// region thins out. A vertical is never used twice in one day, so
// the mid-morning stop and the afternoon's main activity can't both
// be galleries. Labels are time-of-day, from the existing translated
// clusterStop* keys wherever one fits.
const HERO_TRIP_SLOTS = [
  { slot: 'morning',    labelKey: 'clusterStopMorning',   prefs: [['fine_grounds'], ['table', ['bakery', 'market', 'farm_gate', 'providore']]] },
  { slot: 'midmorning', labelKey: 'tripStopMidMorning',   prefs: [['corner'], ['found'], ['collection'], ['craft'], ['field']] },
  { slot: 'midday',     labelKey: 'clusterStopMidday',    prefs: [['table', ['restaurant', 'cafe', 'bistro', 'pub', 'bakery']], ['table'], ['corner']] },
  // Way Atlas listings are deliberately left out of the worked-trip
  // example (the afternoon reaches for the outdoors, then craft/culture
  // instead). The exclusion is also enforced at the query in
  // assembleRegionDay so no Way venue can slip into a stop.
  { slot: 'afternoon',  labelKey: 'clusterStopAfternoon', prefs: [['field'], ['craft'], ['collection']] },
  { slot: 'tasting',    labelKey: 'tripStopTasting',      prefs: [['sba'], ['fine_grounds']] },
  { slot: 'stay',       labelKey: 'clusterStopStay',      prefs: [['rest']] },
]

// Fallback icon per vertical for the trip stops and the ingredients
// grid. Same assignments the rest of the site uses.
const VERTICAL_ICONS = {
  fine_grounds: Coffee, sba: Wine, table: UtensilsCrossed, rest: BedDouble,
  field: Mountain, way: Compass, craft: Hammer, collection: Landmark,
  corner: ShoppingBag, found: Clock,
}

// Ingredients order: the shape of a day, then the shape of a week.
// Names and taglines come from lib/verticalUrl.js (the network's
// single source of truth for what each vertical covers), counts from
// the live index. Per-vertical microcopy is left to Matt below.
const INGREDIENT_ORDER = ['fine_grounds', 'table', 'sba', 'rest', 'field', 'way', 'craft', 'collection', 'corner', 'found']

// All eight states and territories: the scope proof. Three real pins
// each, so TAS, WA, NT and SA are visibly on the chart, not implied.
const PIN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT']
const PINS_PER_STATE = 3

// Example queries for the hero search chips. Every query was verified
// against the live /api/search to return real results; don't swap one
// in without checking it isn't a dead end.
const EXAMPLE_SEARCHES = [
  'wood-fired bakery',
  'natural wine in the Adelaide Hills',
  'a gift for my niece that’s made in Australia',
  'galleries in Hobart',
]

function toFinite(n) {
  const v = parseFloat(n)
  return Number.isFinite(v) ? v : null
}

function pinWorthy(l) {
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

// Equirectangular distance, fine at region scale. Used to keep the
// worked trip drivable: region resolution can reach a fair way out
// (the Margaret River region row includes Bunbury), and a "day" whose
// stops sit 80 km apart stops reading as one day.
function kmBetween(aLat, aLng, bLat, bLng) {
  const dLat = (aLat - bLat) * 111
  const dLng = (aLng - bLng) * 111 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
  return Math.hypot(dLat, dLng)
}
const TRIP_MAX_KM_FROM_CENTRE = 60

async function getStats(publicVerticals) {
  try {
    const sb = getSupabaseAdmin()
    const [{ count }, { count: regionCount }, hasVerticals] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').in('vertical', publicVerticals).not('name', 'ilike', '\\_%'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
      relationHasVerticals(sb, 'listings'),
    ])
    const verticalCountResults = await Promise.all(
      publicVerticals.map(key =>
        filterByVertical(
          sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').not('name', 'ilike', '\\_%'),
          key, hasVerticals
        ).then(({ count: c }) => [key, c || 0])
      )
    )
    return { listings: count || 0, regions: regionCount || 0, verticalCounts: Object.fromEntries(verticalCountResults) }
  } catch {
    return { listings: 0, regions: 0, verticalCounts: {} }
  }
}

// What the dots are: live counts per (vertical, sub_type), the raw
// material for the plate's rotating type counter. PostgREST caps a
// select at 1000 rows and aggregates are disabled on this project, so
// the sub_type column is paged down in parallel and tallied here —
// once an hour inside the home-data cache, never per visitor. Only
// kinds curated in lib/home/typeCounter.js ever render.
async function getTypeCounts(publicVerticals) {
  try {
    const sb = getSupabaseAdmin()
    const base = (cols, opts) => sb
      .from('listings')
      .select(cols, opts)
      .eq('status', 'active')
      .in('vertical', publicVerticals)
      .not('sub_type', 'is', null)
      .not('name', 'ilike', '\\_%')
    const { count } = await base('*', { count: 'exact', head: true })
    const pages = Math.min(Math.ceil((count || 0) / 1000), 20)
    const chunks = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        base('vertical, sub_type')
          .order('id', { ascending: true })
          .range(i * 1000, i * 1000 + 999)
          .then(({ data }) => data || [])
      )
    )
    const counts = {}
    for (const row of chunks.flat()) {
      const k = `${row.vertical}|${row.sub_type}`
      counts[k] = (counts[k] || 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}

// The scope proof: real, openable listings in every state and
// territory, overlaid on the atlas plate. Featured and editors' picks
// first so the sample is the good stuff, but any live pin-worthy row
// qualifies.
async function getScopePins() {
  try {
    const sb = getSupabaseAdmin()
    const perState = await Promise.all(
      PIN_STATES.map(st =>
        sb.from('listings')
          .select('id, name, slug, region, state, vertical, lat, lng, visitable, address_on_request')
          .eq('status', 'active')
          .eq('state', st)
          .not('slug', 'is', null)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .not('name', 'ilike', '\\_%')
          .order('is_featured', { ascending: false })
          .order('editors_pick', { ascending: false })
          .limit(12)
          .then(({ data }) => (data || [])
            .filter(pinWorthy)
            .slice(0, PINS_PER_STATE)
            // A few region values carry street-address fragments; the
            // pin tip falls back to the state rather than print one.
            .map(l => (/\d/.test(l.region || '') ? { ...l, region: null } : l))
          )
      )
    )
    return perState.flat()
  } catch {
    return []
  }
}

// Latest additions across the network, the ticker's feed. Real names
// from the live index, newest first; anything short of a full row
// means no ticker.
async function getRecentListings() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('listings')
      .select('id, name, slug, region, state, vertical')
      .eq('status', 'active')
      .not('name', 'ilike', '\\_%')
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })
      .limit(32)
    // Guard against address fragments leaking into the marquee as
    // "names": a comma next to a number, a trailing postcode, or a
    // state-code+postcode all read as an address, never a venue name.
    const looksLikeAddress = (n) => {
      const s = String(n || '')
      return (/,/.test(s) && /\d{3,4}/.test(s)) ||
             /\b\d{4}\s*$/.test(s) ||
             /\b(VIC|NSW|QLD|SA|WA|TAS|ACT|NT)\b\s*\d{3,4}\b/i.test(s)
    }
    return (data || []).filter(l => !looksLikeAddress(l.name)).slice(0, 20)
  } catch {
    return []
  }
}

// Server-side Directions fetch, mirroring app/api/mapbox/directions.
// Fetched once per hour alongside the trip and cached with it, so
// visitors never each hit the Directions API. TrailMap falls back to
// its own client fetch (then straight lines) when this returns null.
async function fetchDrivingGeometry(coordinates) {
  try {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
    if (!token || coordinates.length < 2 || coordinates.length > 25) return null
    const path = coordinates.map(c => c.join(',')).join(';')
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${path}?geometries=geojson&overview=full&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.routes?.[0]?.geometry ?? null
  } catch {
    return null
  }
}

// One region's attempt at a day, filled slot by slot from its live
// listings. Descriptions render verbatim on the page, so a stop only
// qualifies when the portal row carries real writing (not just a
// name), real coordinates, and a live /place page. The seed shuffles
// the candidate pool, so the same region deals a different day each
// hour without ever loosening those gates.
async function assembleRegionDay(sb, regionName, seed) {
  const { region: resolved } = await resolveRegionParam(regionName)
  const fromTable = resolved ? 'listings_with_region' : 'listings'
  let query = sb
    .from(fromTable)
    .select('id, name, slug, vertical, sub_type, suburb, lat, lng, description, hero_image_url, visitable, address_on_request')
    .eq('status', 'active')
    // Way Atlas experiences never appear in the worked-trip example.
    .neq('vertical', 'way')
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
  const usable = seededShuffle(
    (data || []).filter(l => pinWorthy(l) && String(l.description || '').trim().length > 80),
    seed
  )
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
  for (const { slot, labelKey, prefs } of HERO_TRIP_SLOTS) {
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
  // the prose-first preference survives inside the route search.
  const qualityPenaltyKm = (l) => (descOpensWithAddress(l.description) ? 12 : 0)
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
    stops,
  }
}

// The worked trip for this hour: the hour indexes the region pool,
// and the first region from that point that can fill a day wins. The
// road geometry rides along in the cached payload.
async function getHeroTrip(hourSeed) {
  try {
    const sb = getSupabaseAdmin()
    const pool = HERO_REGION_OVERRIDE ? [HERO_REGION_OVERRIDE] : HERO_REGION_POOL
    for (let i = 0; i < pool.length; i++) {
      const regionName = pool[(hourSeed + i) % pool.length]
      const day = await assembleRegionDay(sb, regionName, hourSeed)
      if (!day) continue
      const routeGeometry = await fetchDrivingGeometry(
        day.stops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])
      )
      return { ...day, routeGeometry }
    }
    return null
  } catch {
    return null
  }
}

// Articles live in the master DB; /journal/[slug] on the portal is
// canonical. Same three-latest feed the previous homepage carried.
async function getLatestArticles() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('articles')
      .select('id, vertical, title, slug, excerpt, hero_image_url, author, published_at, category')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(3)
    return (data || []).map(a => ({
      ...a,
      vertical: a.vertical || 'atlas',
      excerpt: a.excerpt || null,
      article_url: `/journal/${a.slug}`,
    }))
  } catch {
    return []
  }
}

async function assembleHomeData(publicVerticals, hourSeed) {
  const [stats, scopePins, heroTrip, articles, recentListings, typeCounts] = await Promise.all([
    getStats(publicVerticals), getScopePins(), getHeroTrip(hourSeed), getLatestArticles(), getRecentListings(), getTypeCounts(publicVerticals),
  ])
  return { stats, scopePins, heroTrip, articles, recentListings, typeCounts }
}

// The root layout reads auth cookies, so this route renders per-request
// and the page-level `revalidate` above never yields a cached HTML copy.
// unstable_cache amortises the data assembly across requests (15 min
// TTL); the locale overlays below stay per-request, outside the cache.
const getHomeDataCached = unstable_cache(
  async (publicVerticals, hourSeed) => {
    const data = await assembleHomeData(publicVerticals, hourSeed)
    // A transient DB failure must not poison the cache with an empty
    // page: throwing skips the cache write and this request falls back
    // to the uncached assembly.
    if (!data.stats.listings && data.scopePins.length === 0) {
      throw new Error('empty home data, refusing to cache')
    }
    return data
  },
  // v6: raw (vertical, sub_type) tallies joined the payload for the
  // plate's rotating type counter (v5 added the recently-added
  // ticker). A fresh key so no v5 entry missing typeCounts can be
  // served for its remaining hour. hourSeed is an argument, so each
  // hour writes its own entry and the worked trip turns over on the
  // hour.
  ['home-data-v6'],
  { revalidate: 3600 }
)

export default async function Home() {
  const t = await getTranslations('home')
  const locale = await getLocale()
  const publicVerticals = getPublicVerticals()
  const hourSeed = getHourSeed()
  let homeData
  try {
    homeData = await getHomeDataCached(publicVerticals, hourSeed)
  } catch {
    homeData = await assembleHomeData(publicVerticals, hourSeed)
  }
  const { stats, articles } = homeData
  // Lead story is the newest with a photograph (falls back to newest
  // overall); the rest follow in the rail beneath it.
  const featuredArticle = (articles || []).find(a => a.hero_image_url) || (articles || [])[0]
  const restArticles = (articles || []).filter(a => a !== featuredArticle).slice(0, 2)
  const recentListings = await overlayListingTranslations(homeData.recentListings || [], locale)
  const scopePins = await overlayListingTranslations(homeData.scopePins, locale)
  const heroTrip = homeData.heroTrip
    ? { ...homeData.heroTrip, stops: await overlayListingTranslations(homeData.heroTrip.stops, locale) }
    : null
  const regionsCount = stats.regions > 0 ? stats.regions : null

  // The plate's rotating type counter: twelve kinds per hour, drawn
  // from the full curated vocabulary by the same seed that deals the
  // worked trip, so the dozen (and its order) turns over on the hour.
  // Twelve exactly — the CSS rotation in HomeAtlasMap is keyframed to
  // a twelve-step cycle — or none, and the plate renders without it.
  const allTypeEntries = buildTypeCounterEntries(homeData.typeCounts)
  const typeCounter = allTypeEntries.length >= 12
    ? { entries: seededShuffle(allTypeEntries, hourSeed).slice(0, 12), kinds: allTypeEntries.length }
    : null

  return (
    <>
      {/* ── 1. Masthead: the one-liner, then the search ─────────── */}
      {/* The whole front door in three sentences, rendered verbatim.
          Everything below this section is evidence for it: the map is
          the scope, the worked trip is the standard. */}
      <section
        className="relative text-center flex flex-col items-center justify-center px-6 sm:px-12"
        style={{
          minHeight: 'clamp(400px, 62vh, 680px)',
          paddingTop: '3rem',
          paddingBottom: 'clamp(28px, 4vh, 56px)',
          background:
            'radial-gradient(52% 44% at 50% 62%, rgba(196,154,60,0.09), rgba(196,154,60,0) 72%), ' +
            'linear-gradient(180deg, rgba(250,248,244,0.94) 0%, rgba(245,240,230,0.82) 55%, rgba(239,231,216,0.96) 100%), ' +
            'url(/maps/home-map-atlas-ghost.webp) center 38% / cover no-repeat, #EFE7D8',
        }}
      >
        <svg
          className="hero-rise"
          width="26" height="26" viewBox="0 0 24 24" fill="var(--color-gold)" aria-hidden="true"
          style={{ marginBottom: '22px', opacity: 0.92 }}
        >
          <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
        </svg>
        <h1 className="hero-rise" style={{
          fontFamily: 'var(--font-display)', fontWeight: 380, letterSpacing: '-0.022em',
          fontSize: 'clamp(2.6rem, 6.4vw, 5.8rem)', lineHeight: 1.04,
          color: 'var(--color-ink)', maxWidth: '980px', textWrap: 'balance',
        }}>
          {t('frontDoorLead')}
        </h1>

        <p className="mt-6 hero-rise" style={{
          fontFamily: 'var(--font-body)', fontWeight: 350, fontSize: '18px',
          lineHeight: 1.6, color: 'var(--color-ink)', maxWidth: '620px',
          animationDelay: '0.09s',
        }}>
          {t('frontDoorRest')}
        </p>

        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: GOLD, marginTop: '30px',
        }}>
          {t('searchKicker')}
        </p>

        <HomeSearchBar />

        <div className="mt-4 flex items-center justify-center gap-x-2 gap-y-2 flex-wrap px-4" style={{ maxWidth: '680px' }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
            color: 'var(--color-muted)', letterSpacing: '0.02em',
          }}>
            {t('tryLabel')}
          </span>
          {EXAMPLE_SEARCHES.map((q) => (
            <LocalizedLink
              key={q}
              href={`/search?q=${encodeURIComponent(q)}`}
              className="home-try-chip inline-flex items-center"
              style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12.5px',
                color: 'var(--color-ink)', background: 'rgba(255,255,255,0.6)',
                border: '1px solid var(--color-border)', borderRadius: '999px',
                padding: '5px 13px', minHeight: 'unset', whiteSpace: 'nowrap', gap: '6px',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: GOLD, flexShrink: 0 }}>
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {q}
            </LocalizedLink>
          ))}
        </div>
      </section>

      {/* ── 1b. The living index ticker ─────────────────────────── */}
      {/* Real, newest places drifting past: proof the atlas is alive,
          and a serendipity surface (every name is a link). Duplicated
          track = seamless loop; the copy row is aria-hidden and
          untabbable. Pauses on hover; reduced-motion collapses it to a
          static scrollable row. Same treatment the previous front door
          carried, reinstated per Matt. */}
      {recentListings.length >= 8 && (
        <section className="atlas-ticker" aria-label={t('recentlyAddedAria')}>
          <span className="atlas-ticker-label">
            {t('recentlyAdded')}
          </span>
          <div className="atlas-ticker-viewport">
            <div className="atlas-ticker-track">
              {[0, 1].map(copy => (
                <span key={copy} aria-hidden={copy === 1 ? 'true' : undefined} style={{ display: 'inline-flex' }}>
                  {recentListings.map(l => (
                    <LocalizedLink
                      key={`${copy}-${l.id}`}
                      href={`/place/${l.slug}`}
                      className="atlas-ticker-item"
                      tabIndex={copy === 1 ? -1 : undefined}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden="true"
                        fill={(VERTICAL_CARD_TOKENS[l.vertical] || {}).bg || 'var(--color-gold)'}>
                        <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
                      </svg>
                      {l.name}
                      {(l.region || l.state) && (
                        <span className="atlas-ticker-meta">{l.region || l.state}</span>
                      )}
                    </LocalizedLink>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 2. The national map: the scope, shown not said ──────── */}
      {/* The atlas plate plots every verified place; the overlaid gold
          pins are real listings in all eight states and territories,
          each one hoverable and openable. */}
      <HomeAtlasMap
        listingCount={stats.listings}
        categoryCount={publicVerticals.length}
        regionCount={stats.regions}
        scopePins={scopePins}
        typeCounter={typeCounter}
      />

      {/* ── 3. The worked trip: one region, threaded ────────────── */}
      {/* The dish before the ingredients. Six real stops from
          HERO_REGION on the reused trail map, each carrying its own
          listing text verbatim. The copy frames the region as an
          example of what any region gives you, never as the subject. */}
      {heroTrip && heroTrip.stops.length >= 5 && (
        <ScrollReveal as="section" style={{
          paddingBlock: 'clamp(60px, 8vw, 100px)',
          background: 'var(--color-bg)',
        }}>
          {/* Set against a framed plate — the same "exhibit in the page"
              treatment the Living Atlas map wears: a hairline frame and a
              soft shadow on warm parchment, floating on the page's stone
              ground. The day reads as one worked example held up for
              inspection, not a full-bleed band. */}
          <div className="max-w-6xl mx-auto px-6 sm:px-12">
            <div className="day-plate" style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(28,26,23,0.10)',
              boxShadow: 'var(--shadow-md)',
              background: 'var(--color-kraft)',
              padding: 'clamp(26px, 4.5vw, 56px)',
            }}>
              {/* The seeded-contour terrain the taste-deck cards wear, now a
                  faint cartographic ground clipped inside the plate — the
                  atlas-as-paper motif the Living Atlas frame also carries. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 420 460"
                preserveAspectRatio="xMidYMid slice"
                style={{
                  position: 'absolute', right: '-120px', top: '50%',
                  transform: 'translateY(-50%)', width: 'min(68%, 720px)', height: '150%',
                  pointerEvents: 'none',
                }}
              >
                {buildContours('a-day-from-one-region').map((d, i) => (
                  <path key={i} d={d} fill="none" stroke={GOLD} strokeWidth="1" strokeOpacity="0.07" />
                ))}
              </svg>
              <div style={{ position: 'relative' }}>
            <div className="reveal" style={{ maxWidth: '640px', marginBottom: '36px' }}>
              <p className="section-dateline" style={{ marginBottom: '14px' }}>
                {t('tripKicker')}
              </p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(23px, 2.7vw, 33px)', color: 'var(--color-ink)', lineHeight: 1.12,
              }}>
                {t('tripTitle')}
              </h2>
              <p className="mt-3" style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15.5px',
                color: 'var(--color-muted)', margin: '12px 0 0', lineHeight: 1.65, maxWidth: '58ch',
              }}>
                {t('tripIntro', { region: heroTrip.region })}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] gap-8 lg:gap-12 items-start">
              {/* The stops, in day order, each with its listing's own line. */}
              <ol className="reveal" data-reveal-index={1} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {heroTrip.stops.map((stop, si) => {
                  const StopIcon = VERTICAL_ICONS[stop.vertical] || Compass
                  const ground = (VERTICAL_CARD_TOKENS[stop.vertical] || {}).bg || '#333'
                  const kind = subTypeLabel(stop.vertical, stop.sub_type) ||
                    localizeVerticalKicker(stop.vertical, getVerticalBadge(stop.vertical), locale)
                  const isLast = si === heroTrip.stops.length - 1
                  return (
                    <li key={stop.id} style={{ position: 'relative', paddingLeft: '52px', paddingBottom: isLast ? 0 : '26px' }}>
                      {/* the thread: hairline between numbered markers */}
                      {!isLast && (
                        <span aria-hidden="true" style={{
                          position: 'absolute', left: '15px', top: '34px', bottom: '2px',
                          width: '1px', background: 'rgba(184,134,43,0.4)',
                        }} />
                      )}
                      <span aria-hidden="true" style={{
                        position: 'absolute', left: 0, top: 0,
                        width: '31px', height: '31px', borderRadius: '999px',
                        background: ground, color: '#FAF8F4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '13px',
                        border: '2px solid rgba(250,248,244,0.9)',
                        boxShadow: '0 1px 4px rgba(28,26,23,0.25)',
                      }}>
                        {si + 1}
                      </span>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                        letterSpacing: '0.15em', textTransform: 'uppercase',
                        color: GOLD, margin: '0 0 3px',
                      }}>
                        {t(stop.labelKey)}
                      </p>
                      <h3 style={{ margin: 0, lineHeight: 1.2 }}>
                        <LocalizedLink href={`/place/${stop.slug}`} className="hover:underline underline-offset-4" style={{
                          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px',
                          color: 'var(--color-ink)',
                        }}>
                          {stop.name}
                        </LocalizedLink>
                      </h3>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11.5px',
                        color: 'var(--color-muted)', margin: '3px 0 0',
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}>
                        <StopIcon size={12} strokeWidth={1.8} style={{ color: VERTICAL_ACCENTS[stop.vertical] || GOLD }} aria-hidden="true" />
                        {[kind, stop.suburb].filter(Boolean).join(' · ')}
                      </p>
                      {/* The listing's own writing, exactly as it appears on
                          /place/[slug]. Clamped visually, never rewritten. */}
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                        lineHeight: 1.6, color: 'var(--color-ink)', margin: '7px 0 0', maxWidth: '58ch',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {stop.description}
                      </p>
                    </li>
                  )
                })}
              </ol>

              {/* The same six stops on the reused trail map: the route
                  follows real roads (Directions geometry fetched hourly
                  with the trip, never per visitor) and draws itself in,
                  markers popping as the line reaches them. */}
              <div className="reveal lg:sticky" data-reveal-index={2} style={{ top: '90px' }}>
                <TrailMap
                  stops={heroTrip.stops.map((s, i) => ({
                    venue_name: s.name, venue_lat: s.lat, venue_lng: s.lng,
                    vertical: s.vertical, position: i,
                  }))}
                  routeGeometry={heroTrip.routeGeometry || undefined}
                />
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px',
                  lineHeight: 1.55, color: 'var(--color-muted)', margin: '12px 2px 0',
                }}>
                  {regionsCount
                    ? t('tripOneOfMany', { region: heroTrip.region, count: regionsCount })
                    : t('tripOneOfManyNoCount', { region: heroTrip.region })}
                </p>
                {/* The day above is one we assembled; readers can thread
                    their own stops. The builder carries the section's one
                    true action: an ink pill wearing the trip's own motif,
                    a dotted route that travels on hover. The region links
                    stay quiet. */}
                <div style={{ marginTop: '16px' }}>
                  <LocalizedLink href="/trails/builder" className="trail-cta">
                    <svg className="trail-cta-route" width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="4.6" cy="19.2" r="2" fill="#C49A3C" opacity="0.85" />
                      <path
                        className="trail-cta-line"
                        d="M6.4 17.4 C 10.8 13.6, 8.2 10.2, 12.6 8.2 C 15.6 6.8, 17.2 8.6, 18.4 5.8"
                        stroke="#C49A3C" strokeWidth="1.6" strokeLinecap="round"
                      />
                      <circle cx="19" cy="4.4" r="2.7" fill="#C49A3C" />
                      <circle cx="19" cy="4.4" r="1" fill="#1C1A17" />
                    </svg>
                    {t('tripBuildYourOwn')}
                    <svg className="trail-cta-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="M12 5l7 7-7 7" />
                    </svg>
                  </LocalizedLink>
                </div>
                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '16px' }}>
                  {heroTrip.regionSlug && (
                    <LocalizedLink href={`/regions/${heroTrip.regionSlug}`} className="hover:opacity-80 transition-opacity" style={{
                      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                      color: 'var(--color-ink)', borderBottom: '1px solid var(--color-gold)', paddingBottom: 1,
                    }}>
                      {t('clusterSeeRegion')} <span style={{ color: GOLD }}>&rarr;</span>
                    </LocalizedLink>
                  )}
                  <LocalizedLink href="/regions" className="hover:opacity-80 transition-opacity" style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                    color: 'var(--color-ink)', borderBottom: '1px solid var(--color-gold)', paddingBottom: 1,
                  }}>
                    {t('clusterAllRegions')} <span style={{ color: GOLD }}>&rarr;</span>
                  </LocalizedLink>
                </div>
              </div>
            </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ── 4. From the journal ─────────────────────────────────── */}
      {/* Promoted to sit beside the trip: the newest story runs full
          measure with its title set on the photograph, the rest follow
          in a rail, and the whole journal is one gold link away. More
          of the same writing the trip stops prove, at essay length. */}
      {featuredArticle && (
        <ScrollReveal as="section" style={{ background: '#1A1A1A', paddingBlock: '72px' }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <div className="reveal flex flex-wrap items-end justify-between" style={{ gap: '16px', marginBottom: '30px' }}>
              <div style={{ maxWidth: '560px' }}>
                <p className="section-dateline" style={{ marginBottom: '14px' }}>
                  {t('fromTheJournal')}
                </p>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 400,
                  fontSize: 'clamp(28px, 3.6vw, 46px)', color: '#FAF8F4', lineHeight: 1.1,
                }}>
                  {t('storiesFromNetwork')}
                </h2>
              </div>
              <LocalizedLink href="/journal" className="hover:opacity-80 transition-opacity" style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
                color: GOLD, whiteSpace: 'nowrap', paddingBottom: '6px',
              }}>
                {t('journalBrowseAll')} &rarr;
              </LocalizedLink>
            </div>

            {/* Lead story: full measure, title on the photograph. */}
            <a href={featuredArticle.article_url} className="reveal group block" data-reveal-index={1}>
              {featuredArticle.hero_image_url ? (
                <div className="overflow-hidden rounded-lg relative" style={{ height: 'clamp(280px, 36vw, 440px)' }}>
                  <img
                    src={featuredArticle.hero_image_url}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                  />
                  <div aria-hidden="true" className="absolute inset-0" style={{
                    background: 'linear-gradient(to top, rgba(16,14,11,0.85) 0%, rgba(16,14,11,0.3) 45%, rgba(16,14,11,0.05) 70%, transparent 100%)',
                  }} />
                  <div className="absolute left-0 right-0 bottom-0" style={{ padding: 'clamp(20px, 3vw, 32px)' }}>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                      letterSpacing: '0.16em', textTransform: 'uppercase',
                      color: GOLD, marginBottom: '9px',
                    }}>
                      {featuredArticle.vertical === 'atlas'
                        ? t('journalFallback')
                        : localizeVerticalKicker(featuredArticle.vertical, getVerticalBadge(featuredArticle.vertical), locale)}
                      {featuredArticle.category && ` · ${featuredArticle.category}`}
                    </p>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400,
                      fontSize: 'clamp(26px, 3.4vw, 42px)', lineHeight: 1.12,
                      color: '#FAF8F4', margin: 0, maxWidth: '20em', textWrap: 'balance',
                    }}>
                      {featuredArticle.title}
                    </h3>
                  </div>
                </div>
              ) : (
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 400,
                  fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.2,
                  color: '#FAF8F4', margin: 0,
                }}>
                  {featuredArticle.title}
                </h3>
              )}
              <div style={{ paddingTop: '16px', maxWidth: '640px' }}>
                {featuredArticle.excerpt && (
                  <p style={{
                    fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                    lineHeight: 1.65, color: 'rgba(250,248,244,0.6)', margin: '0 0 10px',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {featuredArticle.excerpt}
                  </p>
                )}
                <span className="group-hover:underline underline-offset-4" style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
                  color: GOLD,
                }}>
                  {t('readStory')} &rarr;
                </span>
              </div>
            </a>

            {/* The rest of the latest, two up. */}
            {restArticles.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" style={{ marginTop: '34px' }}>
                {restArticles.map((article, ai) => (
                  <a
                    key={article.id || ai}
                    href={article.article_url}
                    className="reveal group block"
                    data-reveal-index={ai + 2}
                  >
                    {article.hero_image_url ? (
                      <div className="overflow-hidden rounded-lg relative" style={{ height: '220px' }}>
                        <img
                          src={article.hero_image_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                        />
                        <div aria-hidden="true" className="absolute inset-0" style={{
                          background: 'linear-gradient(to top, rgba(16,14,11,0.82) 0%, rgba(16,14,11,0.26) 45%, transparent 75%)',
                        }} />
                        <div className="absolute left-0 right-0 bottom-0" style={{ padding: '18px 20px' }}>
                          <p style={{
                            fontFamily: 'var(--font-body)', fontSize: '10.5px', fontWeight: 600,
                            letterSpacing: '0.16em', textTransform: 'uppercase',
                            color: GOLD, marginBottom: '7px',
                          }}>
                            {article.vertical === 'atlas'
                              ? t('journalFallback')
                              : localizeVerticalKicker(article.vertical, getVerticalBadge(article.vertical), locale)}
                            {article.category && ` · ${article.category}`}
                          </p>
                          <h3 style={{
                            fontFamily: 'var(--font-display)', fontWeight: 400,
                            fontSize: 'clamp(20px, 2.2vw, 26px)', lineHeight: 1.18,
                            color: '#FAF8F4', margin: 0, textWrap: 'balance',
                          }}>
                            {article.title}
                          </h3>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg" style={{
                        border: '1px solid rgba(250,248,244,0.14)', padding: '22px 24px', height: '220px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                      }}>
                        <p style={{
                          fontFamily: 'var(--font-body)', fontSize: '10.5px', fontWeight: 600,
                          letterSpacing: '0.16em', textTransform: 'uppercase',
                          color: GOLD, marginBottom: '7px',
                        }}>
                          {article.vertical === 'atlas'
                            ? t('journalFallback')
                            : localizeVerticalKicker(article.vertical, getVerticalBadge(article.vertical), locale)}
                        </p>
                        <h3 style={{
                          fontFamily: 'var(--font-display)', fontWeight: 400,
                          fontSize: 'clamp(20px, 2.2vw, 26px)', lineHeight: 1.18,
                          color: '#FAF8F4', margin: 0,
                        }}>
                          {article.title}
                        </h3>
                      </div>
                    )}
                    <span className="group-hover:underline underline-offset-4" style={{
                      display: 'inline-block', marginTop: '12px',
                      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                      color: GOLD,
                    }}>
                      {t('readStory')} &rarr;
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </ScrollReveal>
      )}

      {/* ── 5. The ingredients: ten kinds of place ──────────────── */}
      {/* Not a menu of sites: the kinds of stop a trip is built from.
          Names and taglines are the network's own vertical metadata;
          counts are live. */}
      <ScrollReveal as="section" style={{ paddingBlock: '84px' }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-12">
          <div className="reveal" style={{ maxWidth: '620px', marginBottom: '34px' }}>
            <p className="section-dateline" style={{ marginBottom: '14px' }}>
              {t('ingredientsKicker')}
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(28px, 3.6vw, 46px)', color: 'var(--color-ink)', lineHeight: 1.1,
            }}>
              {t('ingredientsTitle')}
            </h2>
            <p className="mt-3" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15.5px',
              color: 'var(--color-muted)', margin: '12px 0 0', lineHeight: 1.65,
            }}>
              {t('ingredientsIntro')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {INGREDIENT_ORDER.filter(k => publicVerticals.includes(k)).map((k, ki) => {
              const Icon = VERTICAL_ICONS[k] || Compass
              const accent = VERTICAL_ACCENTS[k] || GOLD
              const count = stats.verticalCounts[k]
              const name = localizeVerticalKicker(k, getVerticalBadge(k), locale)
              return (
                <LocalizedLink
                  key={k}
                  href={`/search?vertical=${k}`}
                  className="reveal group listing-card block"
                  data-reveal-index={(ki % 5) + 1}
                  style={{
                    background: '#fff', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)', padding: '18px 17px 16px',
                  }}
                >
                  <Icon size={18} strokeWidth={1.6} style={{ color: accent }} aria-hidden="true" />
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '18px',
                    color: 'var(--color-ink)', lineHeight: 1.2, margin: '10px 0 3px',
                  }}>
                    {name}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
                    lineHeight: 1.5, color: 'var(--color-muted)', margin: 0,
                  }}>
                    {getVerticalTagline(k)}
                  </p>
                  {/* MATT: one line per vertical on what this ingredient is
                      to a trip (the morning, the long lunch, the bed).
                      Same gate as listings. Add as home.ingredient_{key}
                      in messages and render it here. */}
                  {count > 0 && (
                    <p style={{
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '12px',
                      color: GOLD, margin: '10px 0 0',
                    }}>
                      {t('countPlaces', { count: count.toLocaleString() })}
                    </p>
                  )}
                </LocalizedLink>
              )
            })}
          </div>
        </div>
      </ScrollReveal>

      {/* ── 6. Make it yours: the taste deck ────────────────────── */}
      {/* Reinstated per Matt: masthead left, the live swipeable deck
          right. A stranger can flick a real card in place, inside the
          feature rather than reading about it. The section ground
          carries the same seeded-contour terrain the cards wear. */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        paddingBlock: '96px',
        background: 'var(--color-kraft)',
        borderTop: '1px solid rgba(28,26,23,0.05)',
        borderBottom: '1px solid rgba(28,26,23,0.05)',
      }}>
        <svg
          aria-hidden="true"
          viewBox="0 0 420 460"
          preserveAspectRatio="xMidYMid slice"
          style={{
            position: 'absolute', right: '-160px', top: '50%',
            transform: 'translateY(-50%)', width: '880px', height: '130%',
            pointerEvents: 'none',
          }}
        >
          {buildContours('make-it-yours').map((d, i) => (
            <path key={i} d={d} fill="none" stroke={GOLD} strokeWidth="1" strokeOpacity="0.07" />
          ))}
        </svg>
        <div className="max-w-6xl mx-auto px-6 sm:px-12" style={{ position: 'relative' }}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-10 lg:gap-16 items-center">
            <div>
              <p className="section-dateline" style={{ marginBottom: '16px' }}>{t('makeItYours')}</p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(30px, 4vw, 50px)', color: 'var(--color-ink)', lineHeight: 1.08,
              }}>
                {t('learnsYourTaste')}
              </h2>
              <p className="mt-3" style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
                lineHeight: 1.65, color: 'var(--color-muted)', margin: '14px 0 18px', maxWidth: '44ch',
              }}>
                {t('discoverIntro')}
              </p>
              {/* Every vertical's accent in one strip: the breadth of the
                  shuffle at a glance, colour-matched to the cards. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 30px', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                  {publicVerticals.map((v, i) => (
                    <span key={v} style={{
                      width: '12px', height: '12px', borderRadius: '999px',
                      background: VERTICAL_ACCENTS[v] || GOLD,
                      border: '2px solid var(--color-kraft)',
                      marginLeft: i === 0 ? 0 : '-4px',
                      display: 'inline-block',
                    }} />
                  ))}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12.5px',
                  letterSpacing: '0.02em', color: 'var(--color-muted)',
                }}>
                  {t('deckCollections')}
                </span>
              </div>
              <LocalizedLink href="/discover" className="discover-cta">
                {t('openDiscover')}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </LocalizedLink>
            </div>
            <div>
              <DiscoverDeck variant="band" hideHead />
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. The standard ─────────────────────────────────────── */}
      {/* One claim, stated plainly. The proof sits above it: the trip
          stops render real listing writing, not badges. */}
      <ScrollReveal as="section" style={{ background: '#1A1A1A', paddingBlock: '80px' }}>
        <div className="max-w-3xl mx-auto px-6 sm:px-12">
          <p className="section-dateline reveal" style={{ marginBottom: '16px' }}>
            {t('standardKicker')}
          </p>
          <h2 className="reveal" style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(28px, 3.6vw, 44px)', color: '#FAF8F4', lineHeight: 1.12,
            marginBottom: '18px',
          }}>
            {t('standardTitle')}
          </h2>
          <p className="reveal" style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            lineHeight: 1.7, color: 'rgba(250,248,244,0.72)', maxWidth: '58ch', margin: 0,
          }}>
            {t('standardBody')}
          </p>

          {/* MATT: leave-off statement, same gate as listings.
              Nothing renders here until you write it: add the copy as
              home.standardLeaveOff in messages/en.json (and ko/zh),
              then un-comment the paragraph below. */}
          {/* <p className="reveal" style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            lineHeight: 1.7, color: 'rgba(250,248,244,0.72)', maxWidth: '58ch', margin: '14px 0 0',
          }}>
            {t('standardLeaveOff')}
          </p> */}

          <div className="reveal" style={{ marginTop: '26px' }}>
            <LocalizedLink href="/independence" className="hover:opacity-80 transition-opacity" style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13.5px',
              color: GOLD,
            }}>
              {t('standardHowLink')} &rarr;
            </LocalizedLink>
          </div>
        </div>
      </ScrollReveal>

      <div className="spectrum-hairline" aria-hidden="true" />

      {/* ── 7. Newsletter close ─────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(180deg, #211B15 0%, #1A1510 100%)',
        paddingBlock: '88px',
      }}>
        <div className="max-w-xl mx-auto px-6 sm:px-12 text-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--color-gold)" aria-hidden="true"
            style={{ margin: '0 auto 24px', display: 'block', opacity: 0.9 }}>
            <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
          </svg>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: GOLD, marginBottom: '18px',
          }}>
            {t('newsletterKicker')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(26px, 3.4vw, 34px)', lineHeight: 1.18,
            color: '#FAF8F4', marginBottom: '14px', textWrap: 'balance',
          }}>
            {t('newsletterTitle')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            lineHeight: 1.65, color: 'rgba(250,248,244,0.6)',
            maxWidth: '460px', margin: '0 auto 28px',
          }}>
            {t('newsletterIntro')}
          </p>
          <NewsletterSignup variant="homepage" />
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
            letterSpacing: '0.02em', color: 'rgba(250,248,244,0.4)',
            marginTop: '16px',
          }}>
            {t('newsletterFinePrint')}
          </p>
        </div>
      </section>
    </>
  )
}
