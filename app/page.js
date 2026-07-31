import LocalizedLink from '@/components/LocalizedLink'
import { randomUUID } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { getTranslations, getLocale } from 'next-intl/server'
import { localizePath, PREFIXED_LOCALES } from '@/lib/i18n/config'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import HeroAtlasBackground from '@/components/HeroAtlasBackground'
import HomeAtlasMap from '@/components/HomeAtlasMap'
import HomeDayCards from '@/components/HomeDayCards'
import HomeDayStrip from '@/components/HomeDayStrip'
import HomeNearYou from '@/components/HomeNearYou'
import NewsletterSignup from '@/components/NewsletterSignup'
import ScrollReveal from '@/components/ScrollReveal'
import DiscoverDeck from '@/components/discover/DiscoverDeck'
import { buildContours } from '@/lib/discover/contours'
import { getPublicVerticals, getVerticalBadge, VERTICAL_ACCENTS, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { buildTypeCounterEntries } from '@/lib/home/typeCounter'
import { buildHomeDay, seededShuffle, pinWorthy } from '@/lib/home/dayBuilder'

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

// MATT: how the worked day renders — 'grid' is the 2-row flip-card
// layout, 'strip' the single-row expand-on-hover accordion. Both
// consume the same day payload; flip this one constant to switch.
const DAY_SECTION_VARIANT = 'grid'

// One value per hour, computed outside the cache and passed in, so it
// participates in the cache key and the whole payload turns over on
// the hour. The worked day itself is assembled in
// lib/home/dayBuilder.js and rendered as flip cards by HomeDayCards.
function getHourSeed() {
  return Math.floor(Date.now() / (60 * 60 * 1000))
}

// Spectrum order: the shape of a day, then the shape of a week.
// Names come from lib/verticalUrl.js (the network's single source of
// truth for what each vertical covers), counts from the live index.
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

// A random sample of the network, the ticker's feed. Real names from
// the live index, drawn from anywhere across the atlas rather than the
// newest first — a serendipity surface, not a freshness feed. Because
// `listings.id` is a random v4 UUID, a slice of rows in id order that
// starts at a random UUID cursor is a uniform random sample, decoupled
// from age, vertical, and region — no extra count query, no clustering.
// The draw runs once per hour when the home-data cache rebuilds (the
// hourSeed key), so the set is stable within the hour and rotates.
// Anything short of a full row means no ticker.
async function getRandomListings() {
  try {
    const sb = getSupabaseAdmin()
    const WINDOW = 60
    const windowFrom = async (cursor) => {
      const { data } = await sb
        .from('listings')
        .select('id, name, slug, region, state, vertical')
        .eq('status', 'active')
        .not('name', 'ilike', '\\_%')
        .not('slug', 'is', null)
        .gte('id', cursor)
        .order('id', { ascending: true })
        .limit(WINDOW)
      return data || []
    }
    let rows = await windowFrom(randomUUID())
    // A cursor landing in the last WINDOW rows of the id space returns a
    // short window; wrap to the start so the ticker always has a full
    // pool to draw from (the ranges are disjoint, so no double-count).
    if (rows.length < 24) {
      rows = rows.concat(await windowFrom('00000000-0000-0000-0000-000000000000'))
    }
    // Guard against address fragments leaking into the marquee as
    // "names": a comma next to a number, a trailing postcode, or a
    // state-code+postcode all read as an address, never a venue name.
    const looksLikeAddress = (n) => {
      const s = String(n || '')
      return (/,/.test(s) && /\d{3,4}/.test(s)) ||
             /\b\d{4}\s*$/.test(s) ||
             /\b(VIC|NSW|QLD|SA|WA|TAS|ACT|NT)\b\s*\d{3,4}\b/i.test(s)
    }
    const clean = rows.filter(l => !looksLikeAddress(l.name))
    // Fisher–Yates shuffle so which 20 show — and their order — vary
    // each hour, not just the window they were drawn from.
    for (let i = clean.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[clean[i], clean[j]] = [clean[j], clean[i]]
    }
    return clean.slice(0, 20)
  } catch {
    return []
  }
}

// The worked day for this hour — one region, assembled in
// lib/home/dayBuilder.js. Rides in the hourly cached payload; the
// client (HomeDayCards) renders it as flip cards, no carousel.
async function getHomeDay(hourSeed) {
  try {
    const sb = getSupabaseAdmin()
    return await buildHomeDay(sb, hourSeed)
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
  const [stats, scopePins, homeDay, articles, randomListings, typeCounts] = await Promise.all([
    getStats(publicVerticals), getScopePins(), getHomeDay(hourSeed), getLatestArticles(), getRandomListings(), getTypeCounts(publicVerticals),
  ])
  return { stats, scopePins, homeDay, articles, randomListings, typeCounts }
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
  // v10: the day payload regained `routeGeometry` (hourly Directions
  // fetch) for the click-to-open route map. A fresh key so no v9 entry
  // — without geometry — is served for its remaining hour. hourSeed is
  // an argument, so each hour writes its own entry and the day and the
  // random ticker turn over on the hour — a new region per visit,
  // every second hour a showcase draw.
  // v12: claimed venues bypass the trail-suitable gate (the heuristic
  // flag locked 26 of 65 claimed listings out of this surface) and the
  // claimed route bonus strengthened to -25 km so slot-level claimed
  // candidates win island-scale detours.
  ['home-data-v12'],
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
  const randomListings = await overlayListingTranslations(homeData.randomListings || [], locale)
  const scopePins = await overlayListingTranslations(homeData.scopePins, locale)
  const homeDay = homeData.homeDay
    ? { ...homeData.homeDay, stops: await overlayListingTranslations(homeData.homeDay.stops, locale) }
    : null
  const regionsCount = stats.regions > 0 ? stats.regions : null

  // The "Near you" shelf renders for signed-in readers only: the shelf
  // is a perk of having an account, and the location it works from can
  // come straight off the profile. The auth read is per-request (the
  // root layout already reads these cookies, so the route renders
  // per-request regardless); AA_DEV_MOCK is the established dev-only
  // escape hatch for verifying auth-gated UI locally.
  let isSignedIn = false
  try {
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    isSignedIn = Boolean(user)
  } catch {}
  if (process.env.NODE_ENV !== 'production' && process.env.AA_DEV_MOCK === '1') {
    isSignedIn = true
  }

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
            'linear-gradient(180deg, rgba(250,248,244,0.94) 0%, rgba(245,240,230,0.82) 55%, rgba(239,231,216,0.96) 100%), #EFE7D8',
          // isolate creates the stacking context that keeps the rotating
          // survey-sheet layer's z-index -1 between this background stack and
          // the hero content. The layer clips itself (inset 0 + overflow
          // hidden), so the section must NOT set overflow: hidden — it would
          // clip the search autocomplete dropdown.
          isolation: 'isolate',
          // position:relative + this z-index lift the whole hero (and the
          // autocomplete dropdown trapped inside the isolate context) above the
          // sibling sections that follow it in the DOM — the spectrum spine and
          // the atlas ticker, whose transform-animated tracks form their own
          // stacking contexts. Without it the dropdown's z-index:100 is scoped
          // to the hero and those later siblings paint over the open results.
          // Stays below the sticky nav (z-50).
          zIndex: 20,
        }}
      >
        <HeroAtlasBackground />
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

      {/* ── 1b. Living spectrum spine — full-bleed colour masthead ── */}
      {/* The ten saturated grounds as one thin 100vw bar in journey order;
          each segment links to its filtered search and peels open on hover
          (wide pointer) to name itself. Masthead, legend, and quick-nav in
          one. The same ten links live labelled in the ingredients ledger
          below, so the slim bar can be decorative-first without being a
          fragile mobile tap target. (Restored — was dropped in the
          front-door rebuild; still carried on the sibling atlases.) */}
      <nav className="spectrum-spine" aria-label={t('spectrumNavAria')}>
        {INGREDIENT_ORDER.filter(k => publicVerticals.includes(k)).map((k, i) => {
          const ground = (VERTICAL_CARD_TOKENS[k] || {}).bg || '#333'
          const count = stats.verticalCounts[k]
          const vName = localizeVerticalKicker(k, getVerticalBadge(k), locale)
          return (
            <LocalizedLink
              key={k}
              href={`/search?vertical=${k}`}
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

      {/* ── 1c. The living index ticker ─────────────────────────── */}
      {/* Real places drifting past, a random sample from across the
          atlas: proof it's alive, and a serendipity surface (every name
          is a link). Duplicated track = seamless loop; the copy row is
          aria-hidden and untabbable. Pauses on hover; reduced-motion
          collapses it to a static scrollable row. Same treatment the
          previous front door carried, reinstated per Matt. */}
      {randomListings.length >= 8 && (
        <section className="atlas-ticker" aria-label={t('atlasSampleAria')}>
          <span className="atlas-ticker-label">
            {t('atlasSample')}
          </span>
          <div className="atlas-ticker-viewport">
            <div className="atlas-ticker-track">
              {[0, 1].map(copy => (
                <span key={copy} aria-hidden={copy === 1 ? 'true' : undefined} style={{ display: 'inline-flex' }}>
                  {randomListings.map(l => (
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

      {/* ── 3. The worked day: one region, dealt as cards ────────── */}
      {/* The dish before the ingredients. One real day in stop order,
          each stop a card that flips on hover to the listing's own
          writing. A different region takes the section every hour —
          regional areas lead the pool — and every second hour draws a
          region holding an operator-managed (Standard) listing, which
          arrives gold-ringed: the claim pitch, made by showing. */}
      {homeDay && (
        <ScrollReveal as="section" style={{
          paddingBlock: 'clamp(60px, 8vw, 100px)',
          background: 'var(--color-bg)',
        }}>
          {/* Set against a framed plate — the same "exhibit in the page"
              treatment the Living Atlas map wears: a hairline frame and a
              soft shadow on warm parchment, floating on the page's stone
              ground. */}
          <div className="max-w-6xl mx-auto px-6 sm:px-12">
            <div className="day-plate reveal" style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(28,26,23,0.10)',
              boxShadow: 'var(--shadow-md)',
              background: 'var(--color-kraft)',
              padding: 'clamp(26px, 4.5vw, 56px)',
            }}>
              {/* The seeded-contour terrain the taste-deck cards wear, a
                  faint cartographic ground clipped inside the plate. */}
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
                {DAY_SECTION_VARIANT === 'strip'
                  ? <HomeDayStrip day={homeDay} regionsCount={regionsCount} />
                  : <HomeDayCards day={homeDay} regionsCount={regionsCount} />}
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

      {/* ── 5. Near you: the signed-in shelf ────────────────────── */}
      {/* Replaced the ingredients ledger. Renders only with a session:
          the closest good coffee, food, culture and stays around the
          reader, from /api/nearby (adaptive radius, per-vertical caps,
          featured/managed venues first). The ten kinds still have their
          labelled front-door presence in the spectrum spine above. */}
      {isSignedIn && (
        <ScrollReveal as="section" style={{ paddingBlock: '84px' }}>
          <div className="max-w-6xl mx-auto px-6 sm:px-12">
            <HomeNearYou />
          </div>
        </ScrollReveal>
      )}

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
