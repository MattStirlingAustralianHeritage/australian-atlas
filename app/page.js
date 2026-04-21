import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import HomeMapSection from '@/components/HomeMapSection'
import NewsletterSignup from '@/components/NewsletterSignup'
import ScrollReveal from '@/components/ScrollReveal'
import { getVerticalClient } from '@/lib/supabase/clients'

export const revalidate = 1800

const GOLD = '#C4973B'

const verticals = [
  { key: 'sba', name: 'Small Batch Atlas', tag: 'Small Batch', desc: 'Craft breweries, wineries, distilleries, cideries and cellar doors', url: 'https://smallbatchatlas.com.au' },
  { key: 'collection', name: 'Culture Atlas', tag: 'Culture', desc: 'Museums, galleries, heritage sites and cultural centres', url: 'https://collectionatlas.com.au' },
  { key: 'craft', name: 'Craft Atlas', tag: 'Craft', desc: 'Makers, artists and studios across every discipline', url: 'https://craftatlas.com.au' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', tag: 'Fine Grounds', desc: 'Specialty coffee roasters and independent cafes', url: 'https://finegroundsatlas.com.au' },
  { key: 'rest', name: 'Rest Atlas', tag: 'Rest', desc: 'Boutique hotels, farm stays, glamping and cottages', url: 'https://restatlas.com.au' },
  { key: 'field', name: 'Field Atlas', tag: 'Field', desc: 'Swimming holes, waterfalls, lookouts and natural places', url: 'https://fieldatlas.com.au' },
  { key: 'corner', name: 'Corner Atlas', tag: 'Corner', desc: 'Bookshops, record stores, homewares and indie retail', url: 'https://corneratlas.com.au' },
  { key: 'found', name: 'Found Atlas', tag: 'Found', desc: 'Vintage stores, op shops, antique dealers and markets', url: 'https://foundatlas.com.au' },
  { key: 'table', name: 'Table Atlas', tag: 'Table', desc: 'Farm gates, bakeries, food producers and providores', url: 'https://tableatlas.com.au' },
]

const VERTICAL_CARD_COLORS = {
  sba:          { bg: '#3D2B1F', text: '#FAF8F4' },
  collection:   { bg: '#2D3436', text: '#FAF8F4' },
  craft:        { bg: '#4A3728', text: '#FAF8F4' },
  fine_grounds: { bg: '#2C1810', text: '#FAF8F4' },
  rest:         { bg: '#1B2631', text: '#FAF8F4' },
  field:        { bg: '#1E3A2F', text: '#FAF8F4' },
  corner:       { bg: '#3B2F2F', text: '#FAF8F4' },
  found:        { bg: '#2F2B26', text: '#FAF8F4' },
  table:        { bg: '#3A2E1F', text: '#FAF8F4' },
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
  'Blue Mountains':        { lat: -33.72, lng: 150.31, r: 0.35 },
  'Adelaide Hills':        { lat: -35.02, lng: 138.72, r: 0.35 },
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', atlas: 'Atlas',
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

async function getStats() {
  try {
    const sb = getSupabaseAdmin()
    const [{ count }, { count: regionCount }] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').not('name', 'ilike', '\\_%'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
    ])

    const regionEntries = Object.entries(REGION_GEO)
    const regionCountResults = await Promise.all(
      regionEntries.map(([name, geo]) =>
        sb.from('listings').select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('lat', geo.lat - geo.r).lte('lat', geo.lat + geo.r)
          .gte('lng', geo.lng - geo.r).lte('lng', geo.lng + geo.r)
          .then(({ count: rc }) => [name, rc || 0])
      )
    )
    const regionCounts = Object.fromEntries(regionCountResults)

    return { listings: count || 0, regions: regionCount || 0, regionCounts }
  } catch {
    return { listings: 0, regions: 0, regionCounts: {} }
  }
}

async function getEditorialHero() {
  const sb = getSupabaseAdmin()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // Priority 1: Recent journal article
  try {
    const { data: articles } = await sb
      .from('articles')
      .select('id, vertical, title, slug, excerpt, hero_image_url, author, published_at, category')
      .eq('status', 'published')
      .gte('published_at', fourteenDaysAgo)
      .order('published_at', { ascending: false })
      .limit(1)
    if (articles?.[0]) {
      const a = articles[0]
      return {
        type: 'article',
        title: a.title,
        excerpt: a.excerpt,
        image: a.hero_image_url,
        url: `${VERTICAL_JOURNAL_URLS[a.vertical] || VERTICAL_JOURNAL_URLS.sba}/${a.slug}`,
        label: `${VERTICAL_LABELS[a.vertical] || 'Atlas'}${a.category ? ` · ${a.category}` : ''}`,
        cta: 'Read the story',
        external: true,
      }
    }
  } catch {}

  // Priority 2: Featured editorial trail
  try {
    const { data: trails } = await sb
      .from('trails')
      .select('id, title, slug, hero_intro, cover_image_url, curator_name, duration_hours')
      .eq('type', 'editorial')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(1)
    if (trails?.[0]) {
      const t = trails[0]
      return {
        type: 'trail',
        title: t.title,
        excerpt: t.hero_intro,
        image: t.cover_image_url,
        url: `/trails/${t.slug}`,
        label: t.curator_name ? `Trail · Curated by ${t.curator_name}` : 'Trail',
        cta: 'Explore this trail',
        external: false,
      }
    }
  } catch {}

  // Priority 3: Featured listing with rich description
  try {
    const { data: listings } = await sb
      .from('listings')
      .select('id, name, slug, description, hero_image_url, vertical, region')
      .eq('status', 'active')
      .eq('is_featured', true)
      .not('description', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(20)
    const rich = (listings || []).filter(l => (l.description || '').split(/\s+/).length >= 40)
    if (rich.length > 0) {
      const seed = getWeeklySeed()
      const pick = rich[seed % rich.length]
      return {
        type: 'listing',
        title: pick.name,
        excerpt: firstSentence(pick.description),
        image: pick.hero_image_url,
        url: `/place/${pick.slug}`,
        label: `${VERTICAL_LABELS[pick.vertical] || 'Atlas'}${pick.region ? ` · ${pick.region}` : ''}`,
        cta: 'Discover this place',
        external: false,
      }
    }
  } catch {}

  return null
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

export default async function Home() {
  const [stats, hero, featured, articles] = await Promise.all([
    getStats(), getEditorialHero(), getFeaturedListings(), getLatestArticles(),
  ])

  const articlesWithImages = articles.filter(a => a.hero_image_url)

  return (
    <>
      {/* ── 1. Editorial Hero ──────────────────────────── */}
      {hero ? (
        <section style={{
          background: '#1A1A1A',
          minHeight: 'clamp(480px, 75vh, 760px)',
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {hero.image && (
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${hero.image})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              opacity: 0.35,
            }} />
          )}
          <div style={{
            position: 'absolute', inset: 0,
            background: hero.image
              ? 'linear-gradient(180deg, rgba(26,26,26,0.3) 0%, rgba(26,26,26,0.85) 70%, rgba(26,26,26,1) 100%)'
              : 'none',
          }} />
          <div className="relative z-10 max-w-3xl mx-auto px-6 sm:px-12" style={{
            paddingTop: '120px', paddingBottom: '80px',
          }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: GOLD, marginBottom: '20px',
            }}>
              {hero.label}
            </p>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.15,
              color: '#FAF8F4', marginBottom: '20px',
              textWrap: 'balance',
            }}>
              {hero.title}
            </h1>
            {hero.excerpt && (
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '17px',
                lineHeight: 1.7, color: 'rgba(250,248,244,0.7)',
                maxWidth: '560px', marginBottom: '32px',
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {hero.excerpt}
              </p>
            )}
            {hero.external ? (
              <a
                href={hero.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full hover:opacity-90 transition-opacity"
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
                  background: GOLD, color: '#1A1A1A',
                }}
              >
                {hero.cta} &rarr;
              </a>
            ) : (
              <Link
                href={hero.url}
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full hover:opacity-90 transition-opacity"
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
                  background: GOLD, color: '#1A1A1A',
                }}
              >
                {hero.cta} &rarr;
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section
          className="relative text-center flex flex-col items-center justify-center px-6 sm:px-12"
          style={{
            minHeight: 'clamp(400px, 60vh, 600px)',
            paddingTop: '3rem', paddingBottom: '2rem',
            background: 'linear-gradient(180deg, #FAF8F4 0%, #F0EBE3 100%)',
          }}
        >
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.01em',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1.1,
            color: 'var(--color-ink)', maxWidth: '820px', textWrap: 'balance',
          }}>
            Nine atlases. One guide to{' '}
            <em style={{ fontStyle: 'italic' }}>independent</em> Australia.
          </h1>
          <p className="mt-6" style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '17px',
            lineHeight: 1.65, color: 'var(--color-muted)', maxWidth: '580px',
          }}>
            A curated guide to the makers, producers, restaurants, galleries, shops, stays, and natural places worth knowing about.
          </p>
          <HomeSearchBar />
        </section>
      )}

      {/* ── Search + Stats Bar ─────────────────────────── */}
      <section style={{
        background: '#FAF8F4',
        borderBottom: '1px solid rgba(28,26,23,0.08)',
        paddingBlock: '28px',
      }}>
        <div className="max-w-3xl mx-auto px-6 sm:px-12">
          <HomeSearchBar />
          {stats.listings > 0 && (
            <div className="mt-4 flex items-center justify-center gap-3 sm:gap-5 flex-wrap" style={{
              fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '14px', letterSpacing: '0.01em',
            }}>
              <span>
                <span style={{ color: GOLD, fontWeight: 500 }}>{stats.listings.toLocaleString()}</span>
                <span style={{ color: 'var(--color-muted)' }}> verified listings</span>
              </span>
              <span style={{ color: GOLD, fontSize: '5px' }}>●</span>
              <span>
                <span style={{ color: GOLD, fontWeight: 500 }}>9</span>
                <span style={{ color: 'var(--color-muted)' }}> atlases</span>
              </span>
              <span style={{ color: GOLD, fontSize: '5px' }}>●</span>
              <span>
                <span style={{ color: GOLD, fontWeight: 500 }}>{stats.regions || '46'}</span>
                <span style={{ color: 'var(--color-muted)' }}> regions</span>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Worth Finding This Week ──────────────────── */}
      {featured.length > 0 && (
        <ScrollReveal as="section" style={{ paddingBlock: '80px' }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <h2 className="reveal text-center" style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
              marginBottom: '12px',
            }}>
              Worth finding this week
            </h2>
            <p className="reveal text-center" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
              color: 'var(--color-muted)', marginBottom: '48px',
            }}>
              A few of the independent places we think you should know about.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {featured.map((listing, li) => {
                const colors = VERTICAL_CARD_COLORS[listing.vertical] || { bg: '#333', text: '#FAF8F4' }
                return (
                  <Link
                    key={listing.id}
                    href={`/place/${listing.slug}`}
                    className="reveal group listing-card block rounded-xl overflow-hidden"
                    data-reveal-index={li + 1}
                    style={{
                      background: listing.hero_image_url ? '#1A1A1A' : colors.bg,
                      border: '1px solid transparent',
                    }}
                  >
                    {listing.hero_image_url ? (
                      <div className="overflow-hidden" style={{ height: '180px' }}>
                        <img
                          src={listing.hero_image_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                        />
                      </div>
                    ) : null}
                    <div style={{ padding: '20px 20px 24px' }}>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                        letterSpacing: '0.15em', textTransform: 'uppercase',
                        color: listing.hero_image_url ? GOLD : 'rgba(250,248,244,0.5)',
                        marginBottom: '8px',
                      }}>
                        {VERTICAL_LABELS[listing.vertical] || listing.vertical}
                        {listing.region && ` · ${listing.region}`}
                      </p>
                      <h3 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 400,
                        fontSize: '20px', lineHeight: 1.3,
                        color: '#FAF8F4', marginBottom: '8px',
                      }}>
                        {listing.name}
                      </h3>
                      {listing.description && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                          lineHeight: 1.6, color: 'rgba(250,248,244,0.55)',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {firstSentence(listing.description)}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ── 3. Map Teaser ──────────────────────────────── */}
      <section style={{ position: 'relative' }}>
        <div style={{
          background: '#1A1A1A', padding: '48px 0 0',
        }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12 text-center" style={{ marginBottom: '32px' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(24px, 3vw, 36px)', color: '#FAF8F4',
              marginBottom: '12px',
            }}>
              The whole network, on one map
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
              color: 'rgba(250,248,244,0.6)', maxWidth: '500px', margin: '0 auto',
            }}>
              {stats.listings > 0
                ? `${stats.listings.toLocaleString()} independent venues across Australia.`
                : 'Independent venues across Australia.'}
            </p>
          </div>
        </div>
        <HomeMapSection listingCount={stats.listings} />
        <div style={{
          background: '#1A1A1A', padding: '24px 0 48px',
          textAlign: 'center',
        }}>
          <Link
            href="/map"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full hover:opacity-90 transition-opacity"
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '15px',
              background: GOLD, color: '#1A1A1A',
            }}
          >
            Explore the full map &rarr;
          </Link>
        </div>
      </section>

      {/* ── 4. The Nine Atlases ────────────────────────── */}
      <ScrollReveal as="section" style={{ paddingBlock: '96px' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12">
          <div className="reveal text-center mb-12">
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
            }}>
              Nine atlases
            </h2>
            <p className="mt-3" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
              color: 'var(--color-muted)', maxWidth: '480px', margin: '12px auto 0',
            }}>
              Each atlas covers a different kind of independent place. Together, they form the network.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {verticals.map((v, vi) => {
              const colors = VERTICAL_CARD_COLORS[v.key]
              return (
                <a
                  key={v.key}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reveal group listing-card block rounded-xl"
                  data-reveal-index={vi + 1}
                  style={{
                    background: colors.bg,
                    padding: '24px 20px',
                    minHeight: '130px',
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid transparent',
                  }}
                >
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px',
                    color: colors.text, lineHeight: 1.25, marginBottom: '6px',
                  }}>
                    {v.name}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px',
                    color: 'rgba(250,248,244,0.55)', lineHeight: 1.5,
                  }}>
                    {v.desc}
                  </p>
                  <div style={{ flex: 1, minHeight: 12 }} />
                  <span className="group-hover:underline underline-offset-4" style={{
                    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px',
                    color: GOLD,
                  }}>
                    Visit {v.tag} &rarr;
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      </ScrollReveal>

      {/* ── 5. Latest from the Journal ──────────────────── */}
      {articlesWithImages.length > 0 && (
        <ScrollReveal as="section" style={{
          background: '#1A1A1A',
          paddingBlock: '80px',
        }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <h2 className="reveal" style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(24px, 3vw, 32px)', color: '#FAF8F4',
              marginBottom: '40px',
            }}>
              From the journal
            </h2>
            <div className={`grid grid-cols-1 ${articlesWithImages.length >= 2 ? 'sm:grid-cols-2' : ''} ${articlesWithImages.length >= 3 ? 'lg:grid-cols-3' : ''} gap-6`}>
              {articlesWithImages.slice(0, 3).map((article, ai) => (
                <a
                  key={article.id || ai}
                  href={article.article_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reveal group block"
                  data-reveal-index={ai + 1}
                >
                  <div className="overflow-hidden rounded-lg" style={{ height: '200px' }}>
                    <img
                      src={article.hero_image_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                    />
                  </div>
                  <div style={{ paddingTop: '16px' }}>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      color: GOLD, marginBottom: '6px',
                    }}>
                      {VERTICAL_LABELS[article.vertical] || 'Atlas'}
                      {article.category && ` · ${article.category}`}
                    </p>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400,
                      fontSize: '20px', lineHeight: 1.25,
                      color: '#FAF8F4', margin: '0 0 8px',
                    }}>
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                        lineHeight: 1.6, color: 'rgba(250,248,244,0.5)',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {article.excerpt}
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link href="/journal" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                color: GOLD, padding: '10px 4px', minHeight: 44,
              }}>
                Read the journal &rarr;
              </Link>
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ── 6. Plan a Trip ─────────────────────────────── */}
      <ScrollReveal as="section" style={{ paddingBlock: '80px' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12">
          <h2 className="reveal text-center mb-10" style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
          }}>
            Plan a trip
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link
              href="/long-weekend"
              className="reveal group listing-card block rounded-2xl"
              data-reveal-index="1"
              style={{
                background: '#2C2420',
                border: '1px solid transparent',
                padding: '32px 28px',
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h3 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '26px',
                color: '#FAF8F4', lineHeight: 1.25, marginBottom: 10,
              }}>
                Long weekend
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                color: 'rgba(250,248,244,0.6)', lineHeight: 1.6,
              }}>
                Tell us where you are and what you&apos;re into.
              </p>
              <div style={{ flex: 1, minHeight: 24 }} />
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                color: GOLD,
              }}>
                Plan a weekend &rarr;
              </span>
            </Link>

            <Link
              href="/on-this-road"
              className="reveal group listing-card block rounded-2xl"
              data-reveal-index="2"
              style={{
                background: '#2C2420',
                border: '1px solid transparent',
                padding: '32px 28px',
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h3 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '26px',
                color: '#FAF8F4', lineHeight: 1.25, marginBottom: 10,
              }}>
                Road trip
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                color: 'rgba(250,248,244,0.6)', lineHeight: 1.6,
              }}>
                You know where you&apos;re going. We&apos;ll find the stops.
              </p>
              <div style={{ flex: 1, minHeight: 24 }} />
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                color: GOLD,
              }}>
                Plan a road trip &rarr;
              </span>
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {/* ── 7. Regions ────────────────────────────────── */}
      <ScrollReveal as="section" style={{ paddingBlock: '80px' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-12">
          <h2 className="reveal text-center mb-10" style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
          }}>
            Explore by region
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: 'Barossa Valley', state: 'SA' },
              { name: 'Mornington Peninsula', state: 'VIC' },
              { name: 'Yarra Valley', state: 'VIC' },
              { name: 'Byron Hinterland', state: 'NSW' },
              { name: 'Blue Mountains', state: 'NSW' },
              { name: 'Adelaide Hills', state: 'SA' },
            ].map((r, ri) => {
              const count = stats.regionCounts[r.name]
              const gradient = STATE_CARD_GRADIENTS[r.state] || STATE_CARD_GRADIENTS.VIC
              return (
                <Link
                  key={r.name}
                  href={`/regions/${r.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className="reveal group listing-card block rounded-xl overflow-hidden"
                  data-reveal-index={ri + 1}
                  style={{
                    background: gradient,
                    border: '1px solid #E8E0D4',
                  }}
                >
                  <div className="p-6 flex flex-col" style={{ minHeight: 140 }}>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
                      color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 4,
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
                    <div style={{ flex: 1, minHeight: 16 }} />
                    {count > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
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

          <div className="mt-8 text-center">
            <Link href="/regions" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
              color: GOLD, padding: '10px 4px', minHeight: 44,
            }}>
              Browse all regions &rarr;
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {/* ── 8. Newsletter ─────────────────────────────── */}
      <section style={{ paddingBlock: '64px', background: '#F5F0E8' }}>
        <div className="max-w-xl mx-auto px-6 sm:px-12 text-center">
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(22px, 3vw, 28px)', color: 'var(--color-ink)',
            marginBottom: '24px',
          }}>
            One independent place, every week.
          </h2>
          <NewsletterSignup variant="homepage" />
        </div>
      </section>
    </>
  )
}
