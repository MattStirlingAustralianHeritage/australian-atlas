import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import HomeMapSection from '@/components/HomeMapSection'
import NewsletterSignup from '@/components/NewsletterSignup'
import ScrollReveal from '@/components/ScrollReveal'
import NearbySection from '@/components/NearbySection'
import DiscoverHomeBand from '@/components/discover/DiscoverHomeBand'
import { getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { getListingRegion, LISTING_REGION_SELECT, resolveRegionParam } from '@/lib/regions'
import { getPublicVerticals, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { Coffee, Wine, UtensilsCrossed, BedDouble, Mountain, Compass, Hammer, Landmark, ShoppingBag, Clock } from 'lucide-react'

export const revalidate = 1800

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

const STATE_CARD_GRADIENTS = {
  VIC: 'linear-gradient(135deg, #F0EBE3 0%, #E8E0D4 100%)',
  NSW: 'linear-gradient(135deg, #EDE8E0 0%, #E0D8CC 100%)',
  QLD: 'linear-gradient(135deg, #F0ECE4 0%, #E4DDD2 100%)',
  SA:  'linear-gradient(135deg, #EEE8DF 0%, #E2DAD0 100%)',
  WA:  'linear-gradient(135deg, #F0EAE2 0%, #E6DED4 100%)',
  TAS: 'linear-gradient(135deg, #ECE8E2 0%, #DED8D0 100%)',
  ACT: 'linear-gradient(135deg, #EEEAE4 0%, #E0DCD4 100%)',
  NT:  'linear-gradient(135deg, #F0ECE6 0%, #E4DED6 100%)',
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
  'quiet farm stay in Tasmania',
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

function firstSentence(text) {
  if (!text) return null
  const match = text.match(/^(.+?[.!?])\s/)
  return match ? match[1] : text.slice(0, 160)
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

const VERTICAL_JOURNAL_URLS = {
  sba: 'https://smallbatchatlas.com.au/journal',
  collection: 'https://collectionatlas.com.au/journal',
  craft: 'https://craftatlas.com.au/journal',
  fine_grounds: 'https://finegroundsatlas.com.au/journal',
  rest: 'https://restatlas.com.au/journal',
  field: 'https://fieldatlas.com.au/journal',
  corner: 'https://corneratlas.com.au/journal',
  found: 'https://foundatlas.com.au/journal',
  table: 'https://tableatlas.com.au/journal',
}

async function getLatestArticles() {
  const allArticles = []
  const slugSet = new Set()

  const [masterResult, sbaResult] = await Promise.all([
    (async () => {
      try {
        const sb = getSupabaseAdmin()
        const { data } = await sb
          .from('articles')
          .select('id, vertical, title, slug, excerpt, hero_image_url, author, published_at, category')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(10)
        return data || []
      } catch { return [] }
    })(),
    (async () => {
      try {
        const sbaClient = getVerticalClient('sba')
        const { data } = await sbaClient
          .from('articles')
          .select('id, title, slug, deck, category, author, hero_image_url, published_at, tags, is_partner_content')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(6)
        return data || []
      } catch { return [] }
    })(),
  ])

  for (const a of masterResult) {
    if (!slugSet.has(a.slug)) {
      slugSet.add(a.slug)
      allArticles.push({
        ...a,
        vertical: a.vertical || 'atlas',
        excerpt: a.excerpt || null,
        article_url: `${VERTICAL_JOURNAL_URLS[a.vertical] || VERTICAL_JOURNAL_URLS.sba}/${a.slug}`,
      })
    }
  }

  for (const a of sbaResult) {
    if (!slugSet.has(a.slug)) {
      slugSet.add(a.slug)
      allArticles.push({
        ...a,
        vertical: 'sba',
        excerpt: a.deck || null,
        article_url: `https://smallbatchatlas.com.au/journal/${a.slug}`,
      })
    }
  }

  allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
  return allArticles.slice(0, 3)
}

async function getDiscoverClusters() {
  try {
    const sb = getSupabaseAdmin()
    const clusterRegions = ['Barossa Valley', 'Mornington Peninsula', 'Hobart & Southern Tasmania', 'Byron Bay', 'Adelaide', 'Melbourne']
    const results = await Promise.all(
      clusterRegions.map(async (region) => {
        // Override-wins resolution per docs/regions.md, via the
        // listings_with_region view (migration 125). Falls back to
        // legacy text eq for unresolvable names (none expected in current set).
        const { region: resolved } = await resolveRegionParam(region)
        const fromTable = resolved ? 'listings_with_region' : 'listings'
        let query = sb
          .from(fromTable)
          .select(`id, name, vertical, slug, region, hero_image_url, ${LISTING_REGION_SELECT}`)
          .eq('status', 'active')
          .order('is_featured', { ascending: false })
          .order('editors_pick', { ascending: false })
          .limit(12)
        if (resolved) {
          query = query.eq('region_id', resolved.id)
        } else {
          query = query.eq('region', region)
        }
        const { data } = await query
        if (!data || data.length < 4) return null
        const verticalSet = new Set(data.map(d => d.vertical))
        if (verticalSet.size < 3) return null
        const picks = []
        const usedVerticals = new Set()
        for (const l of data) {
          if (!usedVerticals.has(l.vertical) && picks.length < 4 && l.slug) {
            picks.push(l)
            usedVerticals.add(l.vertical)
          }
        }
        if (picks.length < 3) return null
        return { region, verticalCount: verticalSet.size, total: data.length, picks }
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
    const { data } = await sb
      .from('listings')
      .select('id, name, slug, description, hero_image_url, vertical, region')
      .eq('status', 'active')
      .eq('is_featured', true)
      .not('description', 'is', null)
      .limit(50)

    if (!data || data.length === 0) return []

    const withDesc = data.filter(l => (l.description || '').split(/\s+/).length >= 15)
    const seed = getWeeklySeed()
    const shuffled = seededShuffle(withDesc, seed)

    const picks = []
    const usedVerticals = new Set()
    for (const l of shuffled) {
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

export default async function Home() {
  const publicVerticals = getPublicVerticals()
  const verticalCount = publicVerticals.length
  const [stats, articlesRaw, clusters, featured, upcomingEvents] = await Promise.all([
    getStats(publicVerticals), getLatestArticles(), getDiscoverClusters(), getFeaturedListings(), getUpcomingEvents(),
  ])
  // States that actually have upcoming events become the "browse by state"
  // chips (in fixed geographic order); the soonest six show as cards.
  const eventStates = EVENT_STATE_ORDER.filter(s => upcomingEvents.some(e => e.state === s))
  const eventCards = upcomingEvents.slice(0, 6)
  const articles = articlesRaw.length > 0 ? articlesRaw : []
  const articlesWithImages = articles.filter(a => a.hero_image_url).slice(0, 2)
  const featuredArticle = articlesWithImages[0] || articles[0]

  return (
    <>
      {/* ── 1. Hero — asymmetric editorial masthead ─────────── */}
      {/* Hard-left masthead (≈60%) beside a stat "colophon" ledger (≈40%) on a
          faint kraft panel. Breaks the centered rhythm at the very top. All hero
          content is preserved — only the axis and composition change. */}
      <section
        className="relative px-6 sm:px-12"
        style={{
          paddingTop: '2.75rem',
          paddingBottom: '2.5rem',
          background: 'linear-gradient(180deg, #FAF8F4 0%, #F0EBE3 100%)',
        }}
      >
        <div className="max-w-6xl mx-auto grid items-start gap-10 lg:gap-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(250px,1fr)]">
          {/* LEFT — masthead + the front-door search */}
          <div>
            <p className="hero-rise section-dateline" style={{ marginBottom: '22px' }}>
              The curated guide · Independent Australia
            </p>
            <h1 className="hero-rise" style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.018em',
              fontSize: 'clamp(2.75rem, 6.4vw, 5.5rem)', lineHeight: 1.02,
              color: 'var(--color-ink)', margin: 0,
            }}>
              Discover<br />
              <em style={{ fontStyle: 'italic' }}>independent</em><br />
              Australia
            </h1>

            <p className="mt-6 hero-rise" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '17px',
              lineHeight: 1.65, color: 'var(--color-muted)', maxWidth: '480px',
              animationDelay: '0.09s',
            }}>
              The curated guide to Australia&apos;s best independent places — every one verified, mapped, and independently run.
            </p>

            {/* Search — the front door. Kicker names the tool, the bar cycles
                example placeholders, the helper states the plain-English
                contract, the chips run real verified queries. */}
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.22em', textTransform: 'uppercase',
              color: GOLD, marginTop: '30px',
            }}>
              Search the atlas
            </p>

            <div style={{ maxWidth: '560px' }}>
              <HomeSearchBar />
            </div>

            <p className="mt-3" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13.5px',
              lineHeight: 1.6, color: 'var(--color-muted)', maxWidth: '520px',
            }}>
              Ask in plain English — name a thing, a place, or a feeling, and we&apos;ll search every category at once.
            </p>

            <div className="mt-4 flex items-center gap-x-2 gap-y-2 flex-wrap" style={{ maxWidth: '620px' }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
                color: 'var(--color-muted)', letterSpacing: '0.02em',
              }}>
                Try
              </span>
              {EXAMPLE_SEARCHES.map((q) => (
                <Link
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
                </Link>
              ))}
            </div>

            <div className="mt-7 flex items-center gap-4 flex-wrap">
              <Link
                href="/map"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full hover:opacity-90 transition-opacity"
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
                  background: '#1A1A1A', color: '#FAF8F4',
                }}
              >
                Explore the map
              </Link>
              <Link
                href="/near-me"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full transition-colors hover:border-[var(--color-ink)]"
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
                  color: 'var(--color-ink)', border: '1px solid var(--color-border)',
                }}
              >
                What&apos;s near me?
              </Link>
            </div>
          </div>

          {/* RIGHT — the stat colophon: a vertical ledger on a kraft panel */}
          {stats.listings > 0 && (
            <aside className="hero-rise" style={{
              animationDelay: '0.16s',
              background: 'rgba(231,220,198,0.5)',
              border: '1px solid rgba(28,26,23,0.06)',
              borderRadius: 'var(--radius-lg)',
              padding: '8px 28px 18px',
              alignSelf: 'start',
            }}>
              {[
                { fig: stats.listings.toLocaleString(), label: 'verified places' },
                { fig: String(verticalCount), label: 'categories' },
                { fig: String(stats.regions || '71'), label: 'regions' },
              ].map((s, i) => (
                <div key={s.label} style={{
                  padding: '18px 0',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(28,26,23,0.10)',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400,
                    fontSize: 'clamp(34px, 4vw, 46px)', lineHeight: 1,
                    color: GOLD, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {s.fig}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: 'var(--color-muted)', marginTop: '9px',
                  }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </aside>
          )}
        </div>
      </section>

      {/* ── 1b. Living spectrum spine — full-bleed colour masthead ── */}
      {/* The ten saturated grounds as one thin 100vw bar in journey order; each
          segment links to its filtered search and peels open on hover (wide
          pointer) to name itself. Masthead, legend, and quick-nav in one. The
          same ten links live labelled in the index ledger below, so the slim
          bar can be decorative-first without being a fragile mobile tap target. */}
      <nav className="spectrum-spine" aria-label="Browse the ten kinds by colour">
        {VERTICAL_GUIDE.filter(v => publicVerticals.includes(v.key)).map((v, i) => {
          const ground = (VERTICAL_CARD_COLORS[v.key] || {}).bg || '#333'
          const count = stats.verticalCounts[v.key]
          return (
            <Link
              key={v.key}
              href={`/search?vertical=${v.key}`}
              className="spectrum-seg"
              style={{ background: ground, animationDelay: `${i * 40}ms` }}
              aria-label={`${v.name}${count ? ` — ${count.toLocaleString()} places` : ''}`}
            >
              <span className="spectrum-seg-label">
                {v.name}{count ? `  ·  ${count.toLocaleString()}` : ''}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* ── 2. Map Strip ────────────────────────────────── */}
      <HomeMapSection listingCount={stats.listings} />

      {/* ── 2.5 What you'll find — the categories ───── */}
      {/* Decodes the map's colour-coded pins and gives every category a real,
          on-site entry point. Dual-label tiles (brand name + plain-English
          descriptor, always visible) are the homepage's core comprehension fix. */}
      <ScrollReveal as="section" style={{
        paddingBlock: '84px',
        background: 'linear-gradient(180deg, #F6F1E9 0%, var(--color-stone) 100%)',
        borderTop: '1px solid rgba(28,26,23,0.06)',
      }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-12">
          <div className="reveal" style={{ marginBottom: '40px', maxWidth: '560px' }}>
            <p className="section-dateline" style={{ marginBottom: '18px' }}>
              What you&apos;ll find
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(28px, 3.6vw, 44px)', color: 'var(--color-ink)',
              lineHeight: 1.1, marginBottom: '14px',
            }}>
              {COUNT_WORDS[verticalCount] || verticalCount} kinds of independent place
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
              lineHeight: 1.65, color: 'var(--color-muted)', margin: 0,
            }}>
              Every place we list belongs to one of {(COUNT_WORDS[verticalCount] || String(verticalCount)).toLowerCase()} categories. Read it like a field guide&apos;s contents — or open any one.
            </p>
          </div>

          {/* The INDEX LEDGER — each vertical a numbered row: a giant Playfair
              numeral and a rule in that vertical's SATURATED ground colour, so
              read top-to-bottom the ten grounds form a living colour gamut down
              the page. Hover widens the rule, shifts the row, and slides in the
              arrow (see .index-row). Same hrefs/counts as before. */}
          <div style={{ borderTop: '1px solid rgba(28,26,23,0.08)' }}>
            {VERTICAL_GUIDE.filter(v => publicVerticals.includes(v.key)).map((v, vi) => {
              const Icon = v.Icon
              const ground = (VERTICAL_CARD_COLORS[v.key] || {}).bg || '#333'
              const count = stats.verticalCounts[v.key]
              return (
                <Link
                  key={v.key}
                  href={`/search?vertical=${v.key}`}
                  className="reveal index-row group flex items-center"
                  data-reveal-index={(vi % 5) + 1}
                  style={{
                    gap: 'clamp(14px, 2.4vw, 26px)',
                    padding: '20px 4px',
                    borderBottom: '1px solid rgba(28,26,23,0.08)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400,
                    fontSize: 'clamp(34px, 5.4vw, 64px)', lineHeight: 0.9,
                    letterSpacing: '-0.03em', color: ground,
                    width: 'clamp(52px, 8vw, 92px)', flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {String(vi + 1).padStart(2, '0')}
                  </span>

                  <span className="index-rule" style={{ background: ground, borderRadius: '2px' }} aria-hidden="true" />

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="flex items-center" style={{ gap: '9px', marginBottom: '4px' }}>
                      <Icon size={14} strokeWidth={1.7} style={{ color: ground, flexShrink: 0 }} aria-hidden="true" />
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                        letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink)',
                      }}>
                        {v.label}
                      </span>
                    </span>
                    <span style={{
                      display: 'block', fontFamily: 'var(--font-display)', fontWeight: 400,
                      fontSize: 'clamp(20px, 2.4vw, 26px)', lineHeight: 1.12, color: 'var(--color-ink)',
                    }}>
                      {v.name}
                    </span>
                    <span className="hidden sm:block" style={{
                      fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13.5px',
                      lineHeight: 1.5, color: 'var(--color-muted)', marginTop: '3px',
                    }}>
                      {v.desc}
                    </span>
                  </span>

                  <span className="flex items-center" style={{ gap: '14px', flexShrink: 0 }}>
                    {count > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                        letterSpacing: '0.03em', color: ground, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {count.toLocaleString()}
                      </span>
                    )}
                    <span className="index-arrow" aria-hidden="true" style={{
                      color: GOLD, fontSize: '18px', fontWeight: 500, lineHeight: 1,
                    }}>
                      &rarr;
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>

          <div className="reveal" style={{ marginTop: '32px' }}>
            <Link href="/explore" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
              color: GOLD, padding: '10px 4px', minHeight: 44,
            }}>
              See everything on one page &rarr;
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {/* ── 3. Worth Finding This Week ──────────────────── */}
      {featured.length > 0 && (
        <ScrollReveal as="section" style={{ paddingBlock: '80px' }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <div className="reveal" style={{ marginBottom: '36px', maxWidth: '560px' }}>
              <p className="section-dateline" style={{ marginBottom: '16px' }}>
                This week
              </p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(26px, 3.2vw, 40px)', color: 'var(--color-ink)',
                lineHeight: 1.1, marginBottom: '12px',
              }}>
                Worth finding this week
              </h2>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
                color: 'var(--color-muted)', margin: 0,
              }}>
                A few of the independent places we think you should know about — one cover story, and a handful more.
              </p>
            </div>

            {/* LEAD + RAIL: the first featured listing is the dominant cover
                story (1.6fr, full-bleed ground or its photo); the rest stack as
                a compact coloured rail (1fr). Scale contrast carries hierarchy. */}
            {(() => {
              const lead = featured[0]
              const rail = featured.slice(1, 4)
              const leadColors = VERTICAL_CARD_COLORS[lead.vertical] || { bg: '#333', text: '#FAF8F4' }
              const leadRegion = getListingRegion(lead)
              return (
                <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
                  {/* LEAD */}
                  <Link
                    key={lead.id}
                    href={`/place/${lead.slug}`}
                    className="reveal group listing-card block overflow-hidden"
                    data-reveal-index={1}
                    style={{
                      background: lead.hero_image_url ? '#1A1A1A' : leadColors.bg,
                      border: '1px solid transparent',
                      borderRadius: 'var(--radius-lg)',
                      display: 'flex', flexDirection: 'column',
                      minHeight: 'clamp(300px, 40vw, 440px)',
                    }}
                  >
                    {lead.hero_image_url && (
                      <div className="overflow-hidden" style={{ flex: '1 1 55%', minHeight: '180px' }}>
                        <img
                          src={lead.hero_image_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                        />
                      </div>
                    )}
                    <div style={{ padding: '30px 30px 32px', display: 'flex', flexDirection: 'column', flex: lead.hero_image_url ? '0 0 auto' : 1 }}>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                        letterSpacing: '0.15em', textTransform: 'uppercase',
                        color: GOLD, marginBottom: '10px',
                      }}>
                        {VERTICAL_LABELS[lead.vertical] || lead.vertical}
                        {leadRegion ? `  ·  ${leadRegion.name}` : ''}
                      </p>
                      {!lead.hero_image_url && <div style={{ flex: 1, minHeight: 20 }} />}
                      <h3 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 400,
                        fontSize: 'clamp(26px, 3.2vw, 36px)', lineHeight: 1.12,
                        color: '#FAF8F4', marginBottom: '12px',
                      }}>
                        {lead.name}
                      </h3>
                      {lead.description && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                          lineHeight: 1.65, color: 'rgba(250,248,244,0.62)', margin: 0, maxWidth: '46ch',
                          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {firstSentence(lead.description)}
                        </p>
                      )}
                    </div>
                  </Link>

                  {/* RAIL */}
                  {rail.length > 0 && (
                    <div className="flex flex-col gap-4">
                      {rail.map((listing, ri) => {
                        const colors = VERTICAL_CARD_COLORS[listing.vertical] || { bg: '#333', text: '#FAF8F4' }
                        const r = getListingRegion(listing)
                        return (
                          <Link
                            key={listing.id}
                            href={`/place/${listing.slug}`}
                            className="reveal group listing-card block overflow-hidden"
                            data-reveal-index={ri + 2}
                            style={{
                              background: colors.bg,
                              border: '1px solid transparent',
                              borderRadius: 'var(--radius-card)',
                              padding: '18px 20px',
                              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                              flex: '1 1 0', minHeight: '104px',
                            }}
                          >
                            <p style={{
                              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                              letterSpacing: '0.15em', textTransform: 'uppercase',
                              color: 'rgba(250,248,244,0.5)', margin: 0,
                            }}>
                              {VERTICAL_LABELS[listing.vertical] || listing.vertical}
                              {r ? `  ·  ${r.name}` : ''}
                            </p>
                            <h3 style={{
                              fontFamily: 'var(--font-display)', fontWeight: 400,
                              fontSize: '19px', lineHeight: 1.22,
                              color: colors.text, margin: '8px 0 0',
                            }}>
                              {listing.name}
                            </h3>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </ScrollReveal>
      )}

      {/* ── 3b. Worth Finding Nearby ─────────────────── */}
      <NearbySection />

      {/* ── 3c. Discover band — live swipeable taster (mid-page) ───── */}
      <DiscoverHomeBand />

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
                From the journal
              </p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(24px, 3vw, 34px)', color: '#FAF8F4', lineHeight: 1.12,
              }}>
                Stories from the network
              </h2>
            </div>
            {articlesWithImages.length >= 2 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                {articlesWithImages.map((article, ai) => (
                  <a
                    key={article.id || ai}
                    href={article.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`reveal group block${ai === 1 ? ' sm:mt-12' : ''}`}
                    data-reveal-index={ai}
                  >
                    <div className="overflow-hidden rounded-lg" style={{
                      height: '220px',
                    }}>
                      <img
                        src={article.hero_image_url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                      />
                    </div>
                    <div style={{ paddingTop: '16px' }}>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                        letterSpacing: '0.15em', textTransform: 'uppercase',
                        color: GOLD, marginBottom: '6px',
                      }}>
                        {VERTICAL_LABELS[article.vertical] || 'Journal'}
                        {article.category && ` · ${article.category}`}
                      </p>
                      <h2 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 400,
                        fontSize: '22px', lineHeight: 1.25,
                        color: '#FAF8F4', margin: '0 0 8px',
                      }}>
                        {article.title}
                      </h2>
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
                        Read the story &rarr;
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <a
                href={featuredArticle.article_url}
                target="_blank"
                rel="noopener noreferrer"
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
                    {VERTICAL_LABELS[featuredArticle.vertical] || 'Journal'}
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
                    Read the story &rarr;
                  </span>
                </div>
              </a>
            )}
          </div>
        </ScrollReveal>
      )}

      {/* ── 5. Cross-Vertical Cluster ──────────────────── */}
      {/* The intermediate kraft band — one oatmeal third surface between the
          binary cream/near-black rhythm. It breaks the long cream run that
          follows the dark Journal and lets the now-saturated vertical cards
          (dark-on-kraft) read at their strongest. */}
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
                Where it overlaps
              </p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(26px, 3.2vw, 40px)', color: 'var(--color-ink)', lineHeight: 1.1,
              }}>
                Discover a cluster
              </h2>
              <p className="mt-3" style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
                color: 'var(--color-muted)', margin: '12px 0 0',
              }}>
                Regions where makers, stays, culture, and food overlap. One place, many reasons to go.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '56px' }}>
              {clusters.map((cluster, ci) => {
                const regionSlug = CLUSTER_REGION_SLUGS[cluster.region]
                return (
                  <div key={cluster.region} className="reveal" data-reveal-index={ci + 1}>
                    <div style={{ marginBottom: '16px', maxWidth: '520px', ...(ci % 2 === 1 ? { marginLeft: 'auto', textAlign: 'right' } : {}) }}>
                      {regionSlug ? (
                        <Link href={`/regions/${regionSlug}`} className="group inline-block">
                          <h3 style={{
                            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 26,
                            color: 'var(--color-ink)', lineHeight: 1.25,
                          }}>
                            {cluster.region}
                            <span className="inline-block ml-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD, fontSize: 18 }}>&rarr;</span>
                          </h3>
                        </Link>
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
                        {cluster.total} places across {cluster.verticalCount} categories
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {cluster.picks.map(pick => {
                        const colors = VERTICAL_CARD_COLORS[pick.vertical] || { bg: '#333', text: '#FAF8F4' }
                        return (
                          <Link
                            key={pick.id}
                            href={`/place/${pick.slug}`}
                            className="listing-card block overflow-hidden"
                            style={{
                              background: colors.bg,
                              borderRadius: 'var(--radius-card)',
                              padding: '20px 16px',
                              minHeight: '140px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{
                              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                              letterSpacing: '0.12em', textTransform: 'uppercase',
                              color: 'rgba(250,248,244,0.45)',
                            }}>
                              {VERTICAL_LABELS[pick.vertical] || pick.vertical}
                            </span>
                            <span style={{
                              fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 400,
                              color: colors.text, lineHeight: 1.3, marginTop: 'auto',
                            }}>
                              {pick.name}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </ScrollReveal>
      )}

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
                Plan a trip
              </p>
              <Link
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
                  Road trip
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                  color: 'rgba(250,248,244,0.62)', lineHeight: 1.6, maxWidth: '34ch',
                }}>
                  You know where you&apos;re going. We&apos;ll find the stops — the makers, the lunch, the detour worth taking.
                </p>
                <div style={{ flex: 1, minHeight: 24 }} />
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: GOLD,
                }}>
                  Plan a road trip &rarr;
                </span>
              </Link>
            </div>

            {/* RIGHT — region mosaic */}
            <div className="reveal" data-reveal-index={2}>
              <div className="flex items-baseline justify-between" style={{ gap: '16px', marginBottom: '20px' }}>
                <p className="section-dateline">By region</p>
                <Link href="/regions" className="hover:opacity-80 transition-opacity" style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: GOLD,
                }}>
                  Browse all &rarr;
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: 'Barossa Valley', slug: 'barossa-valley', state: 'SA' },
                  { name: 'Mornington Peninsula', slug: 'mornington-peninsula', state: 'VIC' },
                  { name: 'Yarra Valley', slug: 'yarra-valley', state: 'VIC' },
                  { name: 'Byron Bay', slug: 'byron-bay', state: 'NSW' },
                  { name: 'Blue Mountains', slug: 'blue-mountains', state: 'NSW' },
                  { name: 'Adelaide Hills', slug: 'adelaide-hills', state: 'SA' },
                ].map((r, ri) => {
                  const count = stats.regionCounts[r.name]
                  const gradient = STATE_CARD_GRADIENTS[r.state] || STATE_CARD_GRADIENTS.VIC
                  return (
                    <Link
                      key={r.slug}
                      href={`/regions/${r.slug}`}
                      className="reveal group listing-card block overflow-hidden"
                      data-reveal-index={(ri % 3) + 1}
                      style={{
                        background: gradient,
                        border: '1px solid #E2D8C6',
                        borderRadius: 'var(--radius-card)',
                      }}
                    >
                      <div className="flex flex-col" style={{ padding: '18px', minHeight: 116 }}>
                        <h3 style={{
                          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 19,
                          color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 4,
                        }}>
                          {r.name}
                        </h3>
                        <p style={{
                          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '10px',
                          letterSpacing: '0.15em', textTransform: 'uppercase',
                          color: GOLD, marginBottom: 0,
                        }}>
                          {r.state}
                        </p>
                        <div style={{ flex: 1, minHeight: 14 }} />
                        {count > 0 && (
                          <span style={{
                            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12.5,
                            color: 'var(--color-muted)',
                          }}>
                            {count} listings
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* ── 8. Newsletter ─────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(180deg, #211B15 0%, #1A1510 100%)',
        paddingBlock: '88px',
      }}>
        <div className="max-w-xl mx-auto px-6 sm:px-12 text-center">
          <div aria-hidden="true" style={{
            width: '40px', height: '1px', background: GOLD,
            margin: '0 auto 26px', opacity: 0.85,
          }} />
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: GOLD, marginBottom: '18px',
          }}>
            The Newsletter
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(26px, 3.4vw, 34px)', lineHeight: 1.18,
            color: '#FAF8F4', marginBottom: '14px', textWrap: 'balance',
          }}>
            One independent place, every week.
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            lineHeight: 1.65, color: 'rgba(250,248,244,0.6)',
            maxWidth: '460px', margin: '0 auto 28px',
          }}>
            New openings, the occasional essay, and the quiet finds worth a detour — one considered email a week. No noise, no algorithms.
          </p>
          <NewsletterSignup variant="homepage" />
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
            letterSpacing: '0.02em', color: 'rgba(250,248,244,0.4)',
            marginTop: '16px',
          }}>
            Free. Unsubscribe anytime.
          </p>
        </div>
      </section>

      {/* ── 8.5 Plan a stay ───────────────────────────── */}
      <section style={{
        background: 'linear-gradient(180deg, #F2ECE0 0%, #ECE3D3 100%)',
        paddingBlock: '96px',
        borderTop: '1px solid rgba(28,26,23,0.06)',
      }}>
        <div className="max-w-3xl mx-auto px-6 sm:px-12">
          <p className="section-dateline" style={{ marginBottom: '20px' }}>
            Plan a stay
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(30px, 4.2vw, 48px)', lineHeight: 1.08,
            color: 'var(--color-ink)', marginBottom: '18px', maxWidth: '640px',
          }}>
            Tell us the kind of trip. We&apos;ll build the days.
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            lineHeight: 1.65, color: 'var(--color-muted)',
            maxWidth: '520px', margin: '0 0 32px',
          }}>
            Coffee to start, a long lunch in the middle, and somewhere good to stay — a day-by-day trip drawn entirely from the independent places listed across the network.
          </p>
          <Link href="/plan-a-stay-v2" className="inline-flex items-center gap-2 rounded-full hover:opacity-90 transition-opacity" style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
            background: '#1A1A1A', color: '#FAF8F4',
            padding: '14px 32px',
          }}>
            Plan a stay &rarr;
          </Link>
        </div>
      </section>

      {/* ── 9. What's on (Events) ─────────────────────── */}
      {/* Hairline top edge so the soft tonal step from the warm "Plan a stay"
          band into the stone ground reads as a deliberate section boundary. */}
      <ScrollReveal as="section" style={{ paddingBlock: '80px', background: 'var(--color-stone)', borderTop: '1px solid rgba(28,26,23,0.06)' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12">
          <div className="reveal" style={{ marginBottom: '36px', maxWidth: '560px' }}>
            <p className="section-dateline" style={{ marginBottom: '16px' }}>
              On the calendar
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(26px, 3.2vw, 40px)', color: 'var(--color-ink)', lineHeight: 1.1,
            }}>
              What&apos;s on
            </h2>
            <p className="mt-3" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
              color: 'var(--color-muted)', margin: '12px 0 0',
            }}>
              Festivals, markets, and long-table dinners across the network.
            </p>
          </div>

          {eventCards.length > 0 ? (
            <>
              {eventStates.length > 1 && (
                <div className="reveal flex flex-wrap items-center justify-center gap-2" style={{ marginBottom: '36px' }}>
                  {eventStates.map(s => (
                    <Link
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
                    </Link>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {eventCards.map((event, ei) => {
                  const isLead = ei === 0
                  return (
                  <Link
                    key={event.id}
                    href={`/events/${event.slug}`}
                    className={`reveal group listing-card block overflow-hidden${isLead ? ' sm:col-span-2' : ''}`}
                    data-reveal-index={ei + 1}
                    style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}
                  >
                    {event.image_url && (
                      <div className="overflow-hidden" style={{ height: isLead ? '240px' : '160px' }}>
                        <img
                          src={event.image_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                        />
                      </div>
                    )}
                    <div style={{ padding: isLead ? '22px 24px 26px' : '18px 20px 22px' }}>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: GOLD, marginBottom: '8px',
                      }}>
                        {formatEventDateShort(event.start_date, event.end_date)}
                      </p>
                      <h3 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 400,
                        fontSize: isLead ? 'clamp(24px, 3vw, 30px)' : '20px', lineHeight: 1.22,
                        color: 'var(--color-ink)', marginBottom: '6px',
                      }}>
                        {event.name}
                      </h3>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px',
                        color: 'var(--color-muted)',
                      }}>
                        {[EVENT_CATEGORY_LABELS[event.category] || 'Event', [event.suburb, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </Link>
                )})}
              </div>

              <div className="mt-10 flex items-center justify-center gap-6 flex-wrap">
                <Link href="/events" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: GOLD,
                }}>
                  Browse all events &rarr;
                </Link>
                <Link href="/events/submit" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: 'var(--color-muted)',
                }}>
                  Submit an event
                </Link>
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
                Nothing on the calendar just yet.
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                lineHeight: 1.6, color: 'var(--color-muted)', marginBottom: '24px',
              }}>
                Markets, festivals, openings, and long-table dinners will appear here as they&apos;re announced.
              </p>
              <Link href="/events/submit" className="inline-flex items-center gap-2 px-6 py-3 rounded-full hover:opacity-90 transition-opacity" style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                background: '#1A1A1A', color: '#FAF8F4',
              }}>
                Submit an event
              </Link>
            </div>
          )}
        </div>
      </ScrollReveal>
    </>
  )
}
