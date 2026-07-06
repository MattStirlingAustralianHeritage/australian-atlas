import LocalizedLink from '@/components/LocalizedLink'
import { unstable_cache } from 'next/cache'
import { getTranslations, getLocale } from 'next-intl/server'
import { localizePath, PREFIXED_LOCALES } from '@/lib/i18n/config'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import NewsletterSignup from '@/components/NewsletterSignup'
import ScrollReveal from '@/components/ScrollReveal'
import NearbySection from '@/components/NearbySection'
import WorthFindingSection from '@/components/home/WorthFindingSection'
import DiscoverDeck from '@/components/discover/DiscoverDeck'
import CategoryGuideSection from '@/components/CategoryGuideSection'
import { getListingRegion, LISTING_REGION_SELECT, resolveRegionParam } from '@/lib/regions'
import { getPublicVerticals, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { subTypeLabel } from '@/lib/subTypeLabels'
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

const VERTICAL_CARD_COLORS = VERTICAL_CARD_TOKENS

const CLUSTER_REGION_SLUGS = {
  'Barossa Valley': 'barossa-valley',
  'Mornington Peninsula': 'mornington-peninsula',
  'Hobart & Southern Tasmania': 'hobart',
  'Byron Hinterland': 'byron-hinterland',
  'Byron Bay': 'byron-bay',
  'Adelaide': null,
  'Melbourne': null,
}

// The cluster section renders each region as a plottable day, not a flat
// sample: one venue per slot, slots in day order. A slot takes the first
// preference [vertical, allowedSubTypes?] that still has an unused
// candidate, so a region without (say) a stay still fills a coherent
// shorter day. Labels are time-of-day only, and any sub_type constraint
// exists to keep the label honest — the morning slot accepts coffee, a
// bakery-ish table venue, or a tour, never a straight restaurant.
const CLUSTER_DAY_SLOTS = [
  { slot: 'morning',   prefs: [['fine_grounds'], ['table', ['bakery', 'market', 'farm_gate', 'providore']], ['way']] },
  { slot: 'midday',    prefs: [['table'], ['way'], ['field'], ['found'], ['corner']] },
  { slot: 'afternoon', prefs: [['craft'], ['collection'], ['corner'], ['found'], ['field'], ['way']] },
  { slot: 'tasting',   prefs: [['sba'], ['fine_grounds']] },
  { slot: 'stay',      prefs: [['rest']] },
]

const CLUSTER_SLOT_LABEL_KEYS = {
  morning: 'clusterStopMorning',
  midday: 'clusterStopMidday',
  afternoon: 'clusterStopAfternoon',
  tasting: 'clusterStopTasting',
  stay: 'clusterStopStay',
}

// Fallback art for unphotographed stops: the vertical's dark ground + icon.
const CLUSTER_VERTICAL_ICONS = {
  fine_grounds: Coffee, sba: Wine, table: UtensilsCrossed, rest: BedDouble,
  field: Mountain, way: Compass, craft: Hammer, collection: Landmark,
  corner: ShoppingBag, found: Clock,
}

// Widest gap between any two stops (equirectangular, fine at region scale),
// rounded up to 5 km — the "all within N km" proof that the day is drivable.
// Null unless EVERY stop carries coordinates: a locality-only pin (NULL
// lat/lng) silently dropped from the pairwise max would let the line
// under-claim the true spread, and the span must stay honest.
function clusterSpanKm(stops) {
  const pts = stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
  if (pts.length < stops.length || pts.length < 2) return null
  let max = 0
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dLat = (pts[i].lat - pts[j].lat) * 111
      const dLng = (pts[i].lng - pts[j].lng) * 111 * Math.cos(((pts[i].lat + pts[j].lat) / 2) * Math.PI / 180)
      max = Math.max(max, Math.hypot(dLat, dLng))
    }
  }
  return Math.max(5, Math.ceil(max / 5) * 5)
}

const REGION_GEO = {
  'Barossa Valley':        { lat: -34.56, lng: 138.95, r: 0.35 },
  'Mornington Peninsula':  { lat: -38.37, lng: 145.03, r: 0.30 },
  'Yarra Valley':          { lat: -37.73, lng: 145.51, r: 0.35 },
  'Byron Hinterland':      { lat: -28.64, lng: 153.50, r: 0.35 },
  'Byron Bay':             { lat: -28.65, lng: 153.61, r: 0.35 },
  'Blue Mountains':        { lat: -33.72, lng: 150.31, r: 0.35 },
  'Adelaide Hills':        { lat: -35.02, lng: 138.72, r: 0.35 },
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
  atlas: 'Journal',
}

// Number words for the gate-aware category count in the grid heading/intro
// (9 when Way is gated off, 10 when WAY_ATLAS_PUBLIC promotes it).
const COUNT_WORDS = { 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve' }

// Plain-English decoder for the categories — the homepage's primary
// comprehension fix. Each card pairs the brand name with an always-visible
// descriptor + a grounded specifics line (drawn from the authoritative vertical
// scope definitions in lib/verticalUrl.js taglines and the /about copy), an
// identity icon, and a brand colour. Cards link to the on-site filtered search
// so browsing a category keeps the user on australianatlas.com.au. The grid is
// filtered through getPublicVerticals() at render time, so a card only appears
// when its vertical is live (Way is gated until WAY_ATLAS_PUBLIC). Ordered as a
// natural journey: coffee → drink → eat → stay → roam → guide → make → see → shop → find.
const VERTICAL_GUIDE = [
  { key: 'fine_grounds', name: 'Fine Grounds', label: 'Specialty coffee',       desc: 'Roasters with their own roastery, and the cafés that take it seriously.', accent: '#8A7055', Icon: Coffee },
  { key: 'sba',          name: 'Small Batch',  label: 'Brewers & distillers',   desc: 'Independent breweries, wineries, distilleries, and cellar doors.',        accent: '#B07A22', Icon: Wine },
  { key: 'table',        name: 'Table',        label: 'Restaurants & food',     desc: 'Independent restaurants, bakeries, markets, and farm gates.',             accent: '#C4634F', Icon: UtensilsCrossed },
  { key: 'rest',         name: 'Rest',         label: 'Boutique stays',         desc: 'Cabins, guesthouses, farm stays, and eco-lodges worth the trip.',         accent: '#5A8A9A', Icon: BedDouble },
  { key: 'field',        name: 'Field',        label: 'Nature & walks',         desc: 'Nature reserves, national parks, swimming holes, and walking trails.',    accent: '#4A7C59', Icon: Mountain },
  { key: 'way',          name: 'Way',          label: 'Tours & experiences',    desc: 'Guided walks, cultural tours, sailing charters, and adventure experiences.', accent: '#6B7A4A', Icon: Compass },
  { key: 'craft',        name: 'Craft',        label: 'Makers & studios',       desc: 'Ceramicists, woodworkers, textile artists, and studio potters.',          accent: '#C1603A', Icon: Hammer },
  { key: 'collection',   name: 'Culture',      label: 'Galleries & museums',    desc: 'Art museums, public galleries, and cultural collections.',                accent: '#7A6B8A', Icon: Landmark },
  { key: 'corner',       name: 'Corner',       label: 'Independent shops',      desc: 'Bookshops, record stores, homewares, and design studios.',                accent: '#5F8A7E', Icon: ShoppingBag },
  { key: 'found',        name: 'Found',        label: 'Vintage & secondhand',   desc: 'Antique dealers, op shops, salvage yards, and curated secondhand.',       accent: '#D4956A', Icon: Clock },
]

// Example queries for the hero search chips — each demonstrates a different
// plain-English pattern (style, thing + region, vibe + state, category + city).
// Every query was verified against the live /api/search to return real
// results; don't swap one in without checking it isn't a dead end.
const EXAMPLE_SEARCHES = [
  'wood-fired bakery',
  'natural wine in the Adelaide Hills',
  'a gift for my niece that’s made in Australia',
  'galleries in Hobart',
]

function getWeeklySeed() {
  const now = new Date()
  return Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))
}

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

const EVENT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const EVENT_CATEGORY_LABELS = {
  festival: 'Festival', market: 'Market', dinner: 'Dinner', tour: 'Tour',
  exhibition: 'Exhibition', workshop: 'Workshop', other: 'Event',
}

const EVENT_STATE_ORDER = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

// Compact date for homepage event cards: "12 Jun", "12–14 Jun", "30 Jun – 2 Jul".
function formatEventDateShort(startDate, endDate) {
  const s = new Date(startDate)
  const e = endDate ? new Date(endDate) : null
  const sd = s.getDate()
  const sm = EVENT_MONTHS[s.getMonth()]
  if (!e || s.toDateString() === e.toDateString()) return `${sd} ${sm}`
  const ed = e.getDate()
  const em = EVENT_MONTHS[e.getMonth()]
  if (sm === em) return `${sd}–${ed} ${sm}`
  return `${sd} ${sm} – ${ed} ${em}`
}

async function getStats(publicVerticals) {
  try {
    const sb = getSupabaseAdmin()
    // Everything that doesn't depend on hasVerticals runs in one parallel
    // wave (the region counts used to wait behind two serial round-trips);
    // only the per-vertical counts need the schema probe first.
    const regionEntries = Object.entries(REGION_GEO)
    const [{ count }, { count: regionCount }, hasVerticals, ...regionCountResults] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').in('vertical', publicVerticals).not('name', 'ilike', '\\_%'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
      relationHasVerticals(sb, 'listings'),
      ...regionEntries.map(([name, geo]) =>
        sb
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('lat', geo.lat - geo.r)
          .lte('lat', geo.lat + geo.r)
          .gte('lng', geo.lng - geo.r)
          .lte('lng', geo.lng + geo.r)
          .then(({ count: rc }) => [name, rc || 0])
      ),
    ])
    const regionCounts = Object.fromEntries(regionCountResults)

    const verticalCountResults = await Promise.all(
      publicVerticals.map(key =>
        filterByVertical(
          sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').not('name', 'ilike', '\\_%'),
          key, hasVerticals
        ).then(({ count: c }) => [key, c || 0])
      )
    )
    const verticalCounts = Object.fromEntries(verticalCountResults)

    return { listings: count || 0, regions: regionCount || 0, verticalCounts, regionCounts }
  } catch {
    return { listings: 0, regions: 0, verticalCounts: {}, regionCounts: {} }
  }
}

// Articles live in the master DB; /journal/[slug] on the portal is canonical.
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

async function getDiscoverClusters() {
  try {
    const sb = getSupabaseAdmin()
    // Pool rotates weekly (same seed as the cover story) so returning
    // readers get a different trio of days without the section ever
    // rendering an unqualified region.
    const clusterRegions = seededShuffle(
      ['Barossa Valley', 'Mornington Peninsula', 'Hobart & Southern Tasmania', 'Byron Bay', 'Adelaide', 'Melbourne'],
      getWeeklySeed()
    )
    const results = await Promise.all(
      clusterRegions.map(async (region) => {
        // Override-wins resolution per docs/regions.md, via the
        // listings_with_region view (migration 125). Falls back to
        // legacy text eq for unresolvable names (none expected in current set).
        const { region: resolved } = await resolveRegionParam(region)
        const fromTable = resolved ? 'listings_with_region' : 'listings'
        let query = sb
          .from(fromTable)
          .select(`id, name, vertical, sub_type, slug, region, suburb, lat, lng, hero_image_url, ${LISTING_REGION_SELECT}`, { count: 'exact' })
          .eq('status', 'active')
          .order('is_featured', { ascending: false })
          .order('editors_pick', { ascending: false })
          .limit(24)
        if (resolved) {
          query = query.eq('region_id', resolved.id)
        } else {
          query = query.eq('region', region)
        }
        const { data, count } = await query
        if (!data || data.length < 4) return null
        const verticalSet = new Set(data.map(d => d.vertical))
        if (verticalSet.size < 3) return null

        // Fill the day arc. Within a vertical a photographed venue outranks
        // the featured ordering — these cards are photo-first.
        const usedIds = new Set()
        const usedVerticals = new Set()
        const stops = []
        for (const { slot, prefs } of CLUSTER_DAY_SLOTS) {
          for (const [v, subTypes] of prefs) {
            if (usedVerticals.has(v)) continue
            const candidates = data.filter(l =>
              l.vertical === v && l.slug && !usedIds.has(l.id) &&
              (!subTypes || subTypes.includes(l.sub_type))
            )
            if (!candidates.length) continue
            const pick = candidates.find(l => l.hero_image_url) || candidates[0]
            stops.push({ ...pick, slot })
            usedIds.add(pick.id)
            usedVerticals.add(v)
            break
          }
        }
        if (stops.length < 3) return null
        return {
          region,
          verticalCount: verticalSet.size,
          total: count || data.length,
          spanKm: clusterSpanKm(stops),
          picks: stops,
        }
      })
    )
    return results.filter(Boolean).slice(0, 3)
  } catch {
    return []
  }
}

async function getFeaturedListings() {
  try {
    const sb = getSupabaseAdmin()
    const seed = getWeeklySeed()
    const SELECT = 'id, name, slug, description, hero_image_url, vertical, region'
    const strong = (rows) => (rows || []).filter(l => (l.description || '').split(/\s+/).length >= 15)

    // Primary pool: editorially featured venues with a real description.
    const { data: featuredRows } = await sb
      .from('listings')
      .select(SELECT)
      .eq('status', 'active')
      .eq('is_featured', true)
      .not('description', 'is', null)
      .not('name', 'ilike', '\\_%')
      .limit(80)

    const pool = strong(featuredRows)

    // Backfill so the cover story is ALWAYS a lead + a 3-card rail — even in the
    // weeks the featured flag is thin (it dropped to a single venue once, which
    // stranded a lone card). Editors' picks first, then any recent well-written
    // venue, deduped and kept cross-vertical.
    if (pool.length < 4) {
      const have = new Set(pool.map(l => l.id))
      const { data: backfill } = await sb
        .from('listings')
        .select(SELECT)
        .eq('status', 'active')
        .not('description', 'is', null)
        .not('name', 'ilike', '\\_%')
        .order('editors_pick', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(160)
      for (const l of strong(backfill)) {
        if (!have.has(l.id)) { pool.push(l); have.add(l.id) }
        if (pool.length >= 24) break
      }
    }

    if (pool.length === 0) return []

    const shuffled = seededShuffle(pool, seed)

    // Lead first: a photographed venue whenever the pool has one, so the cover
    // card is a photograph and not a colour block. Rail then fills one-per-
    // vertical for variety, topping up to four.
    const lead = shuffled.find(l => l.hero_image_url) || shuffled[0]
    const picks = [lead]
    const usedVerticals = new Set([lead.vertical])
    for (const l of shuffled) {
      if (l.id === lead.id) continue
      if (!usedVerticals.has(l.vertical) && picks.length < 4) {
        picks.push(l)
        usedVerticals.add(l.vertical)
      }
    }
    if (picks.length < 4) {
      for (const l of shuffled) {
        if (!picks.includes(l) && picks.length < 4) picks.push(l)
      }
    }
    return picks
  } catch {
    return []
  }
}

// Latest additions across the network — the ticker's feed. Real names from the
// live index, newest first; anything short of a full row means no ticker.
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
    // Guard against address fragments leaking into the marquee as "names"
    // (e.g. "…STON, FLINDERS RD, TYABB VIC 3913"): a comma next to a number, a
    // trailing postcode, or a state-code+postcode all read as an address, never
    // a venue name.
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

async function getUpcomingEvents() {
  try {
    const sb = getSupabaseAdmin()
    const today = new Date().toISOString().split('T')[0]
    const { data } = await sb
      .from('events')
      .select('id, name, slug, start_date, end_date, suburb, state, category, image_url')
      .eq('status', 'approved')
      .gte('end_date', today)
      .order('start_date', { ascending: true })
      .limit(12)
    return data || []
  } catch {
    return []
  }
}

async function assembleHomeData(publicVerticals) {
  const [stats, articles, clusters, featured, upcomingEvents, recentListings] = await Promise.all([
    getStats(publicVerticals), getLatestArticles(), getDiscoverClusters(), getFeaturedListings(), getUpcomingEvents(), getRecentListings(),
  ])
  return { stats, articles, clusters, featured, upcomingEvents, recentListings }
}

// The root layout reads auth cookies, so this route renders dynamically and
// the page-level `revalidate` above never yields a cached HTML copy — every
// request used to re-run the ~25 count/list queries in assembleHomeData.
// unstable_cache amortises that data assembly across requests (15 min TTL);
// the locale overlays below stay per-request, outside the cache.
const getHomeDataCached = unstable_cache(
  async (publicVerticals) => {
    const data = await assembleHomeData(publicVerticals)
    // A transient DB failure must not poison the cache with an empty page
    // (same guard as atlas-index): throwing skips the cache write and this
    // request falls back to the uncached assembly.
    if (!data.stats.listings && data.featured.length === 0 && data.recentListings.length === 0) {
      throw new Error('empty home data — refusing to cache')
    }
    return data
  },
  // Key bumped with the cluster day-arc reshape so a deploy fills fresh
  // (old cached picks lack slot/sub_type/suburb/spanKm).
  ['home-data-v2'],
  { revalidate: 900 }
)

export default async function Home() {
  const t = await getTranslations('home')
  const locale = await getLocale()
  const publicVerticals = getPublicVerticals()
  const verticalCount = publicVerticals.length
  let homeData
  try {
    homeData = await getHomeDataCached(publicVerticals)
  } catch {
    homeData = await assembleHomeData(publicVerticals)
  }
  const { stats, articles: articlesRaw, clusters: clustersRaw, featured: featuredRaw, upcomingEvents, recentListings: recentListingsRaw } = homeData
  // Render listing lists in the active locale (English falls through unchanged).
  const featured = await overlayListingTranslations(featuredRaw, locale)
  const recentListings = await overlayListingTranslations(recentListingsRaw, locale)
  const clusters = await Promise.all(
    clustersRaw.map(async (c) => ({ ...c, picks: await overlayListingTranslations(c.picks, locale) }))
  )
  // States that actually have upcoming events become the "browse by state"
  // chips (in fixed geographic order); the soonest six show as cards.
  const eventStates = EVENT_STATE_ORDER.filter(s => upcomingEvents.some(e => e.state === s))
  const eventCards = upcomingEvents.slice(0, 6)
  // Edition stamp for the weekly picks — refreshed with the page's revalidate
  // window, so the dateline always carries today's date ("This week · 2 July").
  const editionDate = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long' }).format(new Date())
  const articles = articlesRaw.length > 0 ? articlesRaw : []
  const articlesWithImages = articles.filter(a => a.hero_image_url).slice(0, 2)
  const featuredArticle = articlesWithImages[0] || articles[0]

  return (
    <>
      {/* ── 1. Hero — centred masthead ──────────────────────── */}
      {/* Centred (the asymmetric masthead + stat box didn't land), but no longer
          quiet: the compass-star mark opens the page, Fraunces at display optical
          size carries the headline near 7rem, and the emphasised word gets a
          hand-set gold underline. The search stays the focal point below. */}
      <section
        className="relative text-center flex flex-col items-center justify-center px-6 sm:px-12"
        style={{
          minHeight: 'clamp(360px, 60vh, 640px)',
          paddingTop: '3rem',
          paddingBottom: 0,
          background: 'linear-gradient(180deg, #FAF8F4 0%, #F0EBE3 100%)',
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
          fontSize: 'clamp(2.8rem, 7.2vw, 6.6rem)', lineHeight: 1.03,
          color: 'var(--color-ink)', maxWidth: '1020px', textWrap: 'balance',
        }}>
          {t.rich('heroTitle', { em: (chunks) => <em className="hero-em">{chunks}</em> })}
        </h1>

        <p className="mt-6 hero-rise" style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '17px',
          lineHeight: 1.65, color: 'var(--color-muted)', maxWidth: '600px',
          animationDelay: '0.09s',
        }}>
          {t('heroSubtitle')}
        </p>

        {/* Search — the front door of the site. The kicker names the tool, the
            bar cycles example placeholders, the helper line states the
            plain-English contract, and the chips run real verified queries. */}
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: GOLD, marginTop: '28px',
        }}>
          {t('searchKicker')}
        </p>

        <HomeSearchBar />

        <p className="mt-3 px-4" style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13.5px',
          lineHeight: 1.6, color: 'var(--color-muted)', maxWidth: '560px',
        }}>
          {t('searchHelper')}
        </p>

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

        {stats.listings > 0 && (
          <div className="mt-7 flex items-center justify-center gap-3 sm:gap-5 flex-wrap" style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13.5px', letterSpacing: '0.01em',
          }}>
            <span>
              <span style={{ color: GOLD, fontWeight: 500 }}>{stats.listings.toLocaleString()}</span>
              <span style={{ color: 'var(--color-muted)' }}> {t('statPlaces')}</span>
            </span>
            <span aria-hidden="true" style={{ color: GOLD, fontSize: '5px' }}>●</span>
            <span>
              <span style={{ color: GOLD, fontWeight: 500 }}>{verticalCount}</span>
              <span style={{ color: 'var(--color-muted)' }}> {t('statCategories')}</span>
            </span>
            <span aria-hidden="true" style={{ color: GOLD, fontSize: '5px' }}>●</span>
            <span>
              <span style={{ color: GOLD, fontWeight: 500 }}>{stats.regions || '71'}</span>
              <span style={{ color: 'var(--color-muted)' }}> {t('statRegions')}</span>
            </span>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
          <LocalizedLink
            href="/map"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full hover:opacity-90 transition-opacity"
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
              background: '#1A1A1A', color: '#FAF8F4',
            }}
          >
            {t('exploreMap')}
          </LocalizedLink>
          <LocalizedLink
            href="/near-me"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full transition-colors hover:border-[var(--color-ink)]"
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
              color: 'var(--color-ink)', border: '1px solid var(--color-border)',
            }}
          >
            {t('nearMe')}
          </LocalizedLink>
        </div>

        {/* The living atlas, IN the masthead — every verified place as a dot in
            its vertical's colour, rising out of the hero ground. One image, one
            link, zero client JS; the former standalone map strip is absorbed
            here so the first viewport IS the atlas. */}
        <LocalizedLink
          href="/map"
          aria-label={t('heroMapAria')}
          className="hero-map"
        >
          <picture>
            <source srcSet="/maps/home-map-atlas.webp" type="image/webp" />
            <img
              src="/maps/home-map-atlas.jpg"
              alt=""
              width={2560}
              height={680}
              loading="eager"
              decoding="async"
            />
          </picture>
          <span className="hero-map-cta">
            {t('openFullMap')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </LocalizedLink>
      </section>

      {/* ── 1b. Living spectrum spine — full-bleed colour masthead ── */}
      {/* The ten saturated grounds as one thin 100vw bar in journey order; each
          segment links to its filtered search and peels open on hover (wide
          pointer) to name itself. Masthead, legend, and quick-nav in one. The
          same ten links live labelled in the index ledger below, so the slim
          bar can be decorative-first without being a fragile mobile tap target. */}
      <nav className="spectrum-spine" aria-label={t('spectrumNavAria')}>
        {VERTICAL_GUIDE.filter(v => publicVerticals.includes(v.key)).map((v, i) => {
          const ground = (VERTICAL_CARD_COLORS[v.key] || {}).bg || '#333'
          const count = stats.verticalCounts[v.key]
          const vName = localizeVerticalKicker(v.key, v.name, locale)
          return (
            <LocalizedLink
              key={v.key}
              href={`/search?vertical=${v.key}`}
              className="spectrum-seg"
              style={{ background: ground, animationDelay: `${i * 40}ms` }}
              aria-label={`${vName}${count ? ` — ${t('countPlaces', { count: count.toLocaleString() })}` : ''}`}
            >
              <span className="spectrum-seg-label">
                {vName}{count ? `  ·  ${count.toLocaleString()}` : ''}
              </span>
            </LocalizedLink>
          )
        })}
      </nav>

      {/* ── 2. The living index ticker ──────────────────── */}
      {/* Real, newest places drifting past — proof the atlas is alive, and a
          serendipity surface (every name is a link). Duplicated track = seamless
          loop; the copy row is aria-hidden and untabbable. Pauses on hover;
          reduced-motion collapses it to a static scrollable row. */}
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
                        fill={(VERTICAL_CARD_COLORS[l.vertical] || {}).bg || 'var(--color-gold)'}>
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

      {/* ── 3. Worth Finding This Week ──────────────────── */}
      {/* Server hands the cached editorial picks to a client section that
          upgrades itself to within-100km, taste-weighted picks for signed-in
          visitors who already shared a location (see WorthFindingSection).
          Everyone else gets the editorial band exactly as before. */}
      <WorthFindingSection featured={featured} locale={locale} editionDate={editionDate} />

      {/* ── 4. Journal Feature ──────────────────────────── */}
      {featuredArticle && (
        <ScrollReveal as="section" style={{
          background: '#1A1A1A',
          paddingTop: '48px',
          paddingBottom: '40px',
        }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <div className="reveal" style={{ marginBottom: '30px', maxWidth: '560px' }}>
              <p className="section-dateline" style={{ marginBottom: '14px' }}>
                {t('fromTheJournal')}
              </p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(28px, 3.6vw, 44px)', color: '#FAF8F4', lineHeight: 1.12,
              }}>
                {t('storiesFromNetwork')}
              </h2>
            </div>
            {articlesWithImages.length >= 2 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Cover-story treatment: the title sits ON the photograph under
                    an ink scrim, magazine-cover style; the standfirst and CTA
                    stay below on the dark band. */}
                {articlesWithImages.map((article, ai) => (
                  <a
                    key={article.id || ai}
                    href={article.article_url}
                    className="reveal group block"
                    data-reveal-index={ai}
                  >
                    <div className="overflow-hidden rounded-lg relative" style={{
                      height: '300px',
                    }}>
                      <img
                        src={article.hero_image_url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                      />
                      <div aria-hidden="true" className="absolute inset-0" style={{
                        background: 'linear-gradient(to top, rgba(16,14,11,0.82) 0%, rgba(16,14,11,0.28) 45%, rgba(16,14,11,0.05) 70%, transparent 100%)',
                      }} />
                      <div className="absolute left-0 right-0 bottom-0" style={{ padding: '22px 24px' }}>
                        <p style={{
                          fontFamily: 'var(--font-body)', fontSize: '10.5px', fontWeight: 600,
                          letterSpacing: '0.16em', textTransform: 'uppercase',
                          color: GOLD, marginBottom: '8px',
                        }}>
                          {localizeVerticalKicker(article.vertical, VERTICAL_LABELS[article.vertical] || t('journalFallback'), locale)}
                          {article.category && ` · ${article.category}`}
                        </p>
                        <h2 style={{
                          fontFamily: 'var(--font-display)', fontWeight: 400,
                          fontSize: 'clamp(22px, 2.4vw, 30px)', lineHeight: 1.16,
                          color: '#FAF8F4', margin: 0, textWrap: 'balance',
                        }}>
                          {article.title}
                        </h2>
                      </div>
                    </div>
                    <div style={{ paddingTop: '14px' }}>
                      {article.excerpt && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                          lineHeight: 1.6, color: 'rgba(250,248,244,0.55)',
                          margin: '0 0 10px',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {article.excerpt}
                        </p>
                      )}
                      <span className="group-hover:underline underline-offset-4" style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                        color: GOLD,
                      }}>
                        {t('readStory')} &rarr;
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <a
                href={featuredArticle.article_url}
                className="group block reveal"
              >
                {featuredArticle.hero_image_url && (
                  <div className="overflow-hidden rounded-xl" style={{
                    height: 'clamp(220px, 30vw, 350px)',
                  }}>
                    <img
                      src={featuredArticle.hero_image_url}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                    />
                  </div>
                )}
                <div className="reveal" data-reveal-index="1" style={{
                  paddingTop: '20px',
                  maxWidth: '600px',
                }}>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: GOLD, marginBottom: '6px',
                  }}>
                    {localizeVerticalKicker(featuredArticle.vertical, VERTICAL_LABELS[featuredArticle.vertical] || t('journalFallback'), locale)}
                    {featuredArticle.category && ` · ${featuredArticle.category}`}
                  </p>
                  <h2 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400,
                    fontSize: 'clamp(22px, 2.5vw, 26px)', lineHeight: 1.25,
                    color: '#FAF8F4', margin: '0 0 8px',
                  }}>
                    {featuredArticle.title}
                  </h2>
                  {featuredArticle.excerpt && (
                    <p style={{
                      fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                      lineHeight: 1.6, color: 'rgba(250,248,244,0.6)',
                      margin: '0 0 12px',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {featuredArticle.excerpt}
                    </p>
                  )}
                  <span className="group-hover:underline underline-offset-4" style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                    color: GOLD,
                  }}>
                    {t('readStory')} &rarr;
                  </span>
                </div>
              </a>
            )}
          </div>
        </ScrollReveal>
      )}

      {/* ── 5. Worth finding nearby — full-width "where you are" band ── */}
      {/* Its horizontal strip of real nearby places needs the full measure; a
          narrow discovery-band column crushed the names. Own band, dateline
          masthead, left-anchored — the standalone variant it was built for. */}
      <NearbySection />

      {/* ── 6. Make it yours — the Discover taste engine ── */}
      {/* Masthead left, the live swipeable deck right. A stranger can flick a
          real card in place — they're inside the feature, not reading about it. */}
      <section style={{
        paddingBlock: '88px',
        background: 'var(--color-kraft)',
        borderTop: '1px solid rgba(28,26,23,0.05)',
        borderBottom: '1px solid rgba(28,26,23,0.05)',
      }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-12">
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
                lineHeight: 1.65, color: 'var(--color-muted)', margin: '14px 0 26px', maxWidth: '44ch',
              }}>
                {t('discoverIntro')}
              </p>
              <LocalizedLink href="/discover" className="link-quiet" style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
                color: GOLD, textDecoration: 'none',
              }}>
                {t('openDiscover')} &rarr;
              </LocalizedLink>
            </div>
            <div>
              <DiscoverDeck variant="band" hideHead />
            </div>
          </div>
        </div>
      </section>

      {/* ── 6 + 7. Plan a trip + Explore by region — paired columns ── */}
      {/* Two formerly-stacked centered blocks become one alternating two-column
          editorial row: a tall dark "Plan a trip" feature beside an offset
          region mosaic. Breaks the stacked rhythm; all links/counts preserved. */}
      <ScrollReveal as="section" style={{ paddingBlock: '88px' }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-[0.92fr_1.28fr] gap-10 lg:gap-14 items-start">
            {/* LEFT — Plan a trip feature */}
            <div className="reveal" data-reveal-index={1}>
              <p className="section-dateline" style={{ marginBottom: '18px' }}>
                {t('planATrip')}
              </p>
              <LocalizedLink
                href="/on-this-road"
                className="group listing-card block"
                style={{
                  background: '#2C2420',
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-lg)',
                  padding: '32px 30px',
                  minHeight: 'clamp(280px, 32vw, 380px)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(26px, 3vw, 34px)',
                  color: '#FAF8F4', lineHeight: 1.18, marginBottom: 12,
                }}>
                  {t('roadTrip')}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                  color: 'rgba(250,248,244,0.62)', lineHeight: 1.6, maxWidth: '34ch',
                }}>
                  {t('roadTripIntro')}
                </p>
                <div style={{ flex: 1, minHeight: 24 }} />
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: GOLD,
                }}>
                  {t('planRoadTrip')} &rarr;
                </span>
              </LocalizedLink>
            </div>

            {/* RIGHT — region mosaic */}
            <div className="reveal" data-reveal-index={2}>
              <div className="flex items-baseline justify-between" style={{ gap: '16px', marginBottom: '20px' }}>
                <p className="section-dateline">{t('byRegion')}</p>
                <LocalizedLink href="/regions" className="hover:opacity-80 transition-opacity" style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: GOLD,
                }}>
                  {t('browseAll')} &rarr;
                </LocalizedLink>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Dark cartographic cards — the /regions index identity
                    (ink ground, serif italic name, warm small-caps state,
                    amber count) brought home, so the region language is ONE
                    language wherever regions appear. */}
                {[
                  { name: 'Barossa Valley', slug: 'barossa-valley', state: 'SA' },
                  { name: 'Mornington Peninsula', slug: 'mornington-peninsula', state: 'VIC' },
                  { name: 'Yarra Valley', slug: 'yarra-valley', state: 'VIC' },
                  { name: 'Byron Bay', slug: 'byron-bay', state: 'NSW' },
                  { name: 'Blue Mountains', slug: 'blue-mountains', state: 'NSW' },
                  { name: 'Adelaide Hills', slug: 'adelaide-hills', state: 'SA' },
                ].map((r, ri) => {
                  const count = stats.regionCounts[r.name]
                  return (
                    <LocalizedLink
                      key={r.slug}
                      href={`/regions/${r.slug}`}
                      className="reveal group listing-card block overflow-hidden"
                      data-reveal-index={(ri % 3) + 1}
                      style={{
                        background: 'radial-gradient(120% 120% at 20% 0%, #33302A 0%, #2D2A24 55%, #262420 100%)',
                        border: '1px solid rgba(184, 134, 43, 0.16)',
                        borderRadius: 'var(--radius-card)',
                        position: 'relative',
                      }}
                    >
                      {/* faint survey-grid texture in the cartographic amber */}
                      <div aria-hidden="true" style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.16,
                        backgroundImage: 'linear-gradient(rgba(184,134,43,0.35) 0.5px, transparent 0.5px), linear-gradient(90deg, rgba(184,134,43,0.35) 0.5px, transparent 0.5px)',
                        backgroundSize: '28px 28px',
                      }} />
                      <div className="flex flex-col" style={{ padding: '18px', minHeight: 116, position: 'relative' }}>
                        <h3 style={{
                          fontFamily: 'var(--font-display)', fontWeight: 400, fontStyle: 'italic',
                          fontSize: 20, color: '#F3EDE1', lineHeight: 1.2, marginBottom: 5,
                        }}>
                          {r.name}
                        </h3>
                        <p style={{
                          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '10px',
                          letterSpacing: '0.16em', textTransform: 'uppercase',
                          color: '#8a7a5a', marginBottom: 0,
                        }}>
                          {r.state}
                        </p>
                        <div style={{ flex: 1, minHeight: 14 }} />
                        {count > 0 && (
                          <span style={{
                            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                            color: '#C9973F',
                          }}>
                            {t('countPlaces', { count })}
                          </span>
                        )}
                      </div>
                    </LocalizedLink>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* ── 8.5 Plan a stay ───────────────────────────── */}
      <section style={{
        background: 'linear-gradient(180deg, #F2ECE0 0%, #ECE3D3 100%)',
        paddingBlock: '96px',
        borderTop: '1px solid rgba(28,26,23,0.06)',
      }}>
        <div className="max-w-3xl mx-auto px-6 sm:px-12">
          <p className="section-dateline" style={{ marginBottom: '20px' }}>
            {t('planAStay')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(30px, 4.2vw, 48px)', lineHeight: 1.08,
            color: 'var(--color-ink)', marginBottom: '18px', maxWidth: '640px',
          }}>
            {t('planAStayTitle')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            lineHeight: 1.65, color: 'var(--color-muted)',
            maxWidth: '520px', margin: '0 0 32px',
          }}>
            {t('planAStayIntro')}
          </p>
          <LocalizedLink href="/plan-a-stay-v2" className="inline-flex items-center gap-2 rounded-full hover:opacity-90 transition-opacity" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
            background: '#1A1A1A', color: '#FAF8F4',
            padding: '14px 32px',
          }}>
            {t('planAStay')} &rarr;
          </LocalizedLink>
        </div>
      </section>

      {/* ── 5. Cross-Vertical Cluster — a day, plotted ── */}
      {/* The intermediate kraft band — one oatmeal third surface between the
          binary cream/near-black rhythm. Each qualifying region renders as a
          numbered day arc (coffee → lunch → maker → tasting → bed) of paper
          itinerary cards — photo-first, vertical-ground fallback — with a
          coordinate-grounded "all within N km" span and a region-guide CTA,
          so the section reads as a plan to follow, not a swatch collage. */}
      {clusters.length > 0 && (
        <ScrollReveal as="section" style={{
          paddingBlock: '96px',
          background: 'var(--color-kraft)',
          borderTop: '1px solid rgba(28,26,23,0.05)',
          borderBottom: '1px solid rgba(28,26,23,0.05)',
        }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <div className="reveal mb-14" style={{ maxWidth: '560px' }}>
              <p className="section-dateline" style={{ marginBottom: '16px' }}>
                {t('whereItOverlaps')}
              </p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(30px, 4vw, 50px)', color: 'var(--color-ink)', lineHeight: 1.1,
              }}>
                {t('discoverCluster')}
              </h2>
              <p className="mt-3" style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
                color: 'var(--color-muted)', margin: '12px 0 0',
              }}>
                {t('clusterIntro')}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
              {clusters.map((cluster, ci) => {
                const regionSlug = CLUSTER_REGION_SLUGS[cluster.region]
                const metaLine = [
                  t('clusterCounts', { total: cluster.total, categories: cluster.verticalCount }),
                  cluster.spanKm && cluster.spanKm <= 90 ? t('clusterSpan', { km: cluster.spanKm }) : null,
                ].filter(Boolean).join('  ·  ')
                // Static class strings so Tailwind sees them at build time.
                const gridCols = {
                  3: 'grid-cols-1 sm:grid-cols-3',
                  4: 'grid-cols-2 lg:grid-cols-4',
                  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
                }[cluster.picks.length] || 'grid-cols-2 lg:grid-cols-4'
                return (
                  <div key={cluster.region} className="reveal" data-reveal-index={ci + 1}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2" style={{ marginBottom: '20px' }}>
                      <div style={{ maxWidth: '520px' }}>
                        {regionSlug ? (
                          <LocalizedLink href={`/regions/${regionSlug}`} className="group inline-block">
                            <h3 style={{
                              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 26,
                              color: 'var(--color-ink)', lineHeight: 1.25,
                            }}>
                              {cluster.region}
                              <span className="inline-block ml-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD, fontSize: 18 }}>&rarr;</span>
                            </h3>
                          </LocalizedLink>
                        ) : (
                          <h3 style={{
                            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 26,
                            color: 'var(--color-ink)', lineHeight: 1.25,
                          }}>
                            {cluster.region}
                          </h3>
                        )}
                        <p style={{
                          fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
                          color: 'var(--color-muted)', marginTop: 4,
                        }}>
                          {metaLine}
                        </p>
                      </div>
                      {regionSlug && (
                        <LocalizedLink href={`/regions/${regionSlug}`} className="group inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity" style={{
                          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                          color: 'var(--color-ink)', borderBottom: '1px solid var(--color-gold)',
                          paddingBottom: 2, whiteSpace: 'nowrap',
                        }}>
                          {t('clusterSeeRegion')} <span style={{ color: GOLD }}>&rarr;</span>
                        </LocalizedLink>
                      )}
                    </div>

                    <div className={`grid gap-3 sm:gap-4 ${gridCols}`}>
                      {cluster.picks.map((pick, pi) => {
                        const colors = VERTICAL_CARD_COLORS[pick.vertical] || { bg: '#333', text: '#FAF8F4' }
                        const StopIcon = CLUSTER_VERTICAL_ICONS[pick.vertical] || Compass
                        const stopMeta = [
                          subTypeLabel(pick.vertical, pick.sub_type) || localizeVerticalKicker(pick.vertical, VERTICAL_LABELS[pick.vertical] || pick.vertical, locale),
                          pick.suburb,
                        ].filter(Boolean).join(' · ')
                        return (
                          <LocalizedLink
                            key={pick.id}
                            href={`/place/${pick.slug}`}
                            className="listing-card group block overflow-hidden"
                            style={{
                              background: '#FBF8F2',
                              border: '1px solid rgba(28,26,23,0.08)',
                              borderRadius: 'var(--radius-card)',
                              display: 'flex', flexDirection: 'column',
                            }}
                          >
                            <div className="overflow-hidden" style={{ aspectRatio: '4 / 3', background: colors.bg, flexShrink: 0 }}>
                              {pick.hero_image_url ? (
                                <img
                                  src={pick.hero_image_url}
                                  alt=""
                                  loading="lazy"
                                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <StopIcon size={28} strokeWidth={1.25} style={{ color: 'rgba(250,248,244,0.5)' }} aria-hidden="true" />
                                </div>
                              )}
                            </div>
                            <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                              <p style={{
                                fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                                letterSpacing: '0.14em', textTransform: 'uppercase',
                                color: GOLD, margin: 0,
                              }}>
                                {String(pi + 1).padStart(2, '0')} · {t(CLUSTER_SLOT_LABEL_KEYS[pick.slot] || 'clusterStopAfternoon')}
                              </p>
                              <h4 style={{
                                fontFamily: 'var(--font-display)', fontWeight: 400,
                                fontSize: '17px', lineHeight: 1.25,
                                color: 'var(--color-ink)', margin: '6px 0 0',
                              }}>
                                {pick.name}
                              </h4>
                              {stopMeta && (
                                <p style={{
                                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
                                  color: 'var(--color-muted)', margin: '6px 0 0',
                                }}>
                                  {stopMeta}
                                </p>
                              )}
                            </div>
                          </LocalizedLink>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="reveal" style={{ marginTop: '52px' }}>
              <LocalizedLink href="/regions" className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity" style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                color: 'var(--color-ink)', borderBottom: '1px solid var(--color-gold)', paddingBottom: 2,
              }}>
                {t('clusterAllRegions')} <span style={{ color: GOLD }}>&rarr;</span>
              </LocalizedLink>
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ── 9. What's on (Events) ─────────────────────── */}
      {/* Hairline top edge so the soft tonal step from the warm "Plan a stay"
          band into the stone ground reads as a deliberate section boundary. */}
      <ScrollReveal as="section" style={{ paddingBlock: '80px', background: 'var(--color-stone)', borderTop: '1px solid rgba(28,26,23,0.06)' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12">
          <div className="reveal" style={{ marginBottom: '36px', maxWidth: '560px' }}>
            <p className="section-dateline" style={{ marginBottom: '16px' }}>
              {t('onTheCalendar')}
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(30px, 4vw, 50px)', color: 'var(--color-ink)', lineHeight: 1.1,
            }}>
              {t('whatsOn')}
            </h2>
            <p className="mt-3" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
              color: 'var(--color-muted)', margin: '12px 0 0',
            }}>
              {t('whatsOnIntro')}
            </p>
          </div>

          {eventCards.length > 0 ? (
            <>
              {eventStates.length > 1 && (
                <div className="reveal flex flex-wrap items-center justify-center gap-2" style={{ marginBottom: '36px' }}>
                  {eventStates.map(s => (
                    <LocalizedLink
                      key={s}
                      href={`/events?state=${s}`}
                      className="hover:opacity-80 transition-opacity"
                      style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: 'var(--color-ink)', background: '#fff',
                        border: '1px solid var(--color-border)', borderRadius: '999px',
                        padding: '7px 14px',
                      }}
                    >
                      {s}
                    </LocalizedLink>
                  ))}
                </div>
              )}

              {/* With a thin calendar (1–2 events) a 3-col grid strands cards on
                  the left; a centred flex row keeps the section composed. */}
              <div
                className={eventCards.length < 3
                  ? 'flex flex-wrap justify-center gap-6'
                  : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'}
              >
                {eventCards.map((event, ei) => (
                  <LocalizedLink
                    key={event.id}
                    href={`/events/${event.slug}`}
                    className="reveal group listing-card block overflow-hidden"
                    data-reveal-index={ei + 1}
                    style={{
                      background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)',
                      ...(eventCards.length < 3 ? { width: 'min(100%, 340px)' } : {}),
                    }}
                  >
                    {event.image_url && (
                      <div className="overflow-hidden" style={{ height: '160px' }}>
                        <img
                          src={event.image_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                        />
                      </div>
                    )}
                    <div style={{ padding: '18px 20px 22px' }}>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: GOLD, marginBottom: '8px',
                      }}>
                        {formatEventDateShort(event.start_date, event.end_date)}
                      </p>
                      <h3 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 400,
                        fontSize: '20px', lineHeight: 1.28,
                        color: 'var(--color-ink)', marginBottom: '6px',
                      }}>
                        {event.name}
                      </h3>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px',
                        color: 'var(--color-muted)',
                      }}>
                        {[EVENT_CATEGORY_LABELS[event.category] || t('eventFallback'), [event.suburb, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </LocalizedLink>
                ))}
              </div>

              <div className="mt-10 flex items-center justify-center gap-6 flex-wrap">
                <LocalizedLink href="/events" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: GOLD,
                }}>
                  {t('browseAllEvents')} &rarr;
                </LocalizedLink>
                <LocalizedLink href="/events/submit" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: 'var(--color-muted)',
                }}>
                  {t('submitEvent')}
                </LocalizedLink>
              </div>
            </>
          ) : (
            <div className="reveal text-center" style={{
              maxWidth: '440px', margin: '0 auto',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
              padding: '48px 32px', background: '#fff',
            }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontStyle: 'italic',
                fontSize: '20px', color: 'var(--color-ink)', marginBottom: '10px',
              }}>
                {t('noEventsTitle')}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '24px',
              }}>
                {t('noEventsIntro')}
              </p>
              <LocalizedLink href="/events/submit" className="inline-flex items-center gap-2 px-6 py-3 rounded-full hover:opacity-90 transition-opacity" style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                background: '#1A1A1A', color: '#FAF8F4',
              }}>
                {t('submitEvent')}
              </LocalizedLink>
            </div>
          )}
        </div>
      </ScrollReveal>

      {/* The ten grounds thread the close, as they do the footer. */}
      <div className="spectrum-hairline" aria-hidden="true" />

      {/* ── 8. Newsletter ─────────────────────────────── */}
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

      <CategoryGuideSection
        publicVerticals={publicVerticals}
        verticalCounts={stats.verticalCounts}
        verticalCount={verticalCount}
      />

    </>
  )
}
