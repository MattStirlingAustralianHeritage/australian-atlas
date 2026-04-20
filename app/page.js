import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import NewsletterSignup from '@/components/NewsletterSignup'
import ScrollReveal from '@/components/ScrollReveal'
import { getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'

export const revalidate = 1800

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

const REGION_ACCENT_COLORS = {
  'Barossa Valley': '#C49A3C',
  'Mornington Peninsula': '#C49A3C',
  'Yarra Valley': '#C49A3C',
  'Byron Hinterland': '#4A7C59',
  'Blue Mountains': '#7A6B8A',
  'Adelaide Hills': '#C49A3C',
}

// Bounding box coordinates for homepage region cards (center + radius in degrees)
const REGION_GEO = {
  'Barossa Valley':        { lat: -34.56, lng: 138.95, r: 0.35 },
  'Mornington Peninsula':  { lat: -38.37, lng: 145.03, r: 0.30 },
  'Yarra Valley':          { lat: -37.73, lng: 145.51, r: 0.35 },
  'Byron Hinterland':      { lat: -28.64, lng: 153.50, r: 0.35 },
  'Blue Mountains':        { lat: -33.72, lng: 150.31, r: 0.35 },
  'Adelaide Hills':        { lat: -35.02, lng: 138.72, r: 0.35 },
}

async function getStats() {
  try {
    const sb = getSupabaseAdmin()
    const [{ count }, { count: regionCount }] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').not('name', 'ilike', '\\_%'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
    ])
    // Get per-vertical counts (parallel)
    const verticalCountResults = await Promise.all(
      verticals.map(v =>
        sb.from('listings').select('*', { count: 'exact', head: true }).eq('vertical', v.key).eq('status', 'active').not('name', 'ilike', '\\_%')
          .then(({ count: c }) => [v.key, c || 0])
      )
    )
    const verticalCounts = Object.fromEntries(verticalCountResults)

    // Get listing counts for homepage region cards — bounding box queries (parallel)
    const regionEntries = Object.entries(REGION_GEO)
    const regionCountResults = await Promise.all(
      regionEntries.map(([name, geo]) =>
        sb
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('lat', geo.lat - geo.r)
          .lte('lat', geo.lat + geo.r)
          .gte('lng', geo.lng - geo.r)
          .lte('lng', geo.lng + geo.r)
          .then(({ count: rc }) => [name, rc || 0])
      )
    )
    const regionCounts = Object.fromEntries(regionCountResults)

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
  // Pull from both master DB (CMS-synced) and SBA vertical in parallel, then deduplicate
  const allArticles = []
  const slugSet = new Set()

  const [masterResult, sbaResult] = await Promise.all([
    // 1. Master DB articles (all verticals, synced from CMS)
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
    // 2. SBA vertical articles (supplement)
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

  // Merge master articles first (priority)
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

  // Then SBA articles (supplement)
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

  // Sort all articles by published_at descending, take top 3
  allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
  return allArticles.slice(0, 3)
}

async function getDiscoverClusters() {
  try {
    const sb = getSupabaseAdmin()
    const clusterRegions = ['Barossa Valley', 'Mornington Peninsula', 'Hobart & Southern Tasmania', 'Byron Hinterland', 'Adelaide', 'Melbourne']
    const results = await Promise.all(
      clusterRegions.map(async (region) => {
        const { data } = await sb
          .from('listings')
          .select('id, name, vertical, slug, region, hero_image_url')
          .eq('status', 'active')
          .eq('region', region)
          .order('is_featured', { ascending: false })
          .order('editors_pick', { ascending: false })
          .limit(12)
        if (!data || data.length < 4) return null
        const verticalSet = new Set(data.map(d => d.vertical))
        if (verticalSet.size < 3) return null
        const picks = []
        const usedVerticals = new Set()
        for (const l of data) {
          if (!usedVerticals.has(l.vertical) && picks.length < 4) {
            picks.push(l)
            usedVerticals.add(l.vertical)
          }
        }
        return { region, verticalCount: verticalSet.size, total: data.length, picks }
      })
    )
    return results.filter(Boolean).slice(0, 3)
  } catch {
    return []
  }
}

async function getFeaturedByVertical() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('listings')
      .select('name, vertical')
      .eq('status', 'active')
      .eq('is_featured', true)
      .limit(30)
    // Group by vertical: { sba: ['Name 1', 'Name 2'], ... }
    const grouped = {}
    for (const row of (data || [])) {
      if (!grouped[row.vertical]) grouped[row.vertical] = []
      if (grouped[row.vertical].length < 2) grouped[row.vertical].push(row.name)
    }
    return grouped
  } catch {
    return {}
  }
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', atlas: 'Atlas',
}

export default async function Home() {
  const [stats, articlesRaw, featuredByVertical, clusters] = await Promise.all([getStats(), getLatestArticles(), getFeaturedByVertical(), getDiscoverClusters()])
  const articles = articlesRaw.length > 0 ? articlesRaw : []

  const featuredArticle = articles.find(a => a.hero_image_url) || articles[0]

  return (
    <>
      {/* ── 1. Hero ─────────────────────────────────────── */}
      <section className="relative text-center flex flex-col items-center justify-center px-6 sm:px-12" style={{ minHeight: 'min(88vh, 800px)', paddingTop: '3rem', paddingBottom: '3rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.01em',
          fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1.1,
          color: 'var(--color-ink)', maxWidth: '900px',
        }}>
          Nine atlases. One guide to<br /><em style={{ fontStyle: 'italic' }}>independent</em> Australia.
        </h1>

        <p className="mt-6" style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '17px',
          lineHeight: 1.65, color: 'var(--color-muted)', maxWidth: '580px',
        }}>
          A curated guide to the makers, producers, restaurants, galleries, shops, stays, and natural places worth knowing about.
        </p>

        {stats.listings > 0 && (
          <div className="mt-5 flex items-center justify-center gap-4 sm:gap-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', letterSpacing: '0.02em' }}>
            <span className="text-[var(--color-ink)]">{stats.listings.toLocaleString()} verified listings</span>
            <span className="text-[var(--color-accent)]" style={{ fontSize: '6px' }}>●</span>
            <span className="text-[var(--color-ink)]">9 atlases</span>
            <span className="text-[var(--color-accent)]" style={{ fontSize: '6px' }}>●</span>
            <span className="text-[var(--color-ink)]">{stats.regions || '46'} regions</span>
          </div>
        )}

        <HomeSearchBar />

        <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/map"
            className="inline-flex items-center gap-2 text-white px-7 py-3 rounded-full hover:opacity-90 transition-opacity"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', background: 'var(--color-ink)' }}
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
      </section>

      {/* ── 2. Journal Feature ──────────────────────────── */}
      {featuredArticle && (
        <ScrollReveal as="section" style={{ paddingBlock: '120px' }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <a
              href={featuredArticle.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              {featuredArticle.hero_image_url && (
                <div className="reveal relative overflow-hidden rounded-xl" style={{ aspectRatio: '21/9' }}>
                  <img
                    src={featuredArticle.hero_image_url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                  />
                </div>
              )}
              <div className="reveal" data-reveal-index="1" style={{ maxWidth: '640px', marginTop: '2rem' }}>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: 'var(--color-muted)', marginBottom: '10px',
                }}>
                  {VERTICAL_LABELS[featuredArticle.vertical] || 'Atlas'}
                  {featuredArticle.category && ` · ${featuredArticle.category}`}
                </p>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 400,
                  fontSize: 'clamp(24px, 3vw, 36px)', lineHeight: 1.2,
                  color: 'var(--color-ink)', margin: '0 0 12px',
                }}>
                  {featuredArticle.title}
                </h2>
                {featuredArticle.excerpt && (
                  <p style={{
                    fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
                    lineHeight: 1.65, color: 'var(--color-muted)', margin: '0 0 16px',
                  }}>
                    {featuredArticle.excerpt}
                  </p>
                )}
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                  color: 'var(--color-accent)',
                }}>
                  Read the story &rarr;
                </span>
              </div>
            </a>
          </div>
        </ScrollReveal>
      )}

      {/* ── 3. Cross-Vertical Cluster ──────────────────── */}
      {clusters.length > 0 && (
        <ScrollReveal as="section" style={{ paddingBlock: '96px', background: 'var(--color-cream)' }}>
          <div className="max-w-5xl mx-auto px-6 sm:px-12">
            <div className="reveal text-center mb-12">
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
              }}>
                Discover a cluster
              </h2>
              <p className="mt-3" style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
                color: 'var(--color-muted)', maxWidth: '480px', margin: '12px auto 0',
              }}>
                Regions where makers, stays, culture, and food overlap. One place, many reasons to go.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {clusters.map((cluster, ci) => (
                <Link
                  key={cluster.region}
                  href={`/regions/${cluster.region.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-')}`}
                  className="reveal group listing-card block rounded-xl overflow-hidden"
                  data-reveal-index={ci + 1}
                  style={{ background: '#fff', border: '1px solid var(--color-border)' }}
                >
                  <div className="p-6">
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20,
                      color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 6,
                    }}>
                      {cluster.region}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12,
                      color: 'var(--color-muted)', marginBottom: 16,
                    }}>
                      {cluster.total} listings across {cluster.verticalCount} atlases
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {cluster.picks.map(pick => {
                        const color = VERTICAL_CARD_COLORS[pick.vertical]?.bg || '#333'
                        return (
                          <div key={pick.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600,
                              letterSpacing: '0.1em', textTransform: 'uppercase',
                              color: color, minWidth: 65,
                            }}>
                              {VERTICAL_LABELS[pick.vertical] || pick.vertical}
                            </span>
                            <span style={{
                              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
                              color: 'var(--color-ink)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {pick.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ── 4. Plan a Trip ─────────────────────────────── */}
      <ScrollReveal as="section" style={{ paddingBlock: '96px' }}>
        <div className="max-w-4xl mx-auto px-6 sm:px-12">
          <h2 className="reveal text-center mb-10" style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-ink)',
          }}>
            Plan a trip
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link
              href="/long-weekend"
              className="reveal group listing-card block rounded-xl p-8"
              data-reveal-index="1"
              style={{ background: 'var(--color-ink)', border: '1px solid transparent' }}
            >
              <h3 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px',
                color: '#fff', lineHeight: 1.25, marginBottom: 8,
              }}>
                Long weekend
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 20,
              }}>
                Tell us where you are and what you&apos;re into.
              </p>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                color: 'rgba(255,255,255,0.7)',
              }}>
                Plan a weekend &rarr;
              </span>
            </Link>

            <Link
              href="/on-this-road"
              className="reveal group listing-card block rounded-xl p-8"
              data-reveal-index="2"
              style={{ background: 'var(--color-ink)', border: '1px solid transparent' }}
            >
              <h3 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px',
                color: '#fff', lineHeight: 1.25, marginBottom: 8,
              }}>
                Road trip
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
                color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 20,
              }}>
                You know where you&apos;re going. We&apos;ll find the stops.
              </p>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                color: 'rgba(255,255,255,0.7)',
              }}>
                Plan a road trip &rarr;
              </span>
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {/* ── 5. Regions ────────────────────────────────── */}
      <ScrollReveal as="section" style={{ paddingBlock: '96px' }}>
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
              return (
                <Link
                  key={r.name}
                  href={`/regions/${r.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className="reveal group listing-card block rounded-xl overflow-hidden"
                  data-reveal-index={ri + 1}
                  style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}
                >
                  <div className="p-6 flex flex-col" style={{ minHeight: 140 }}>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
                      color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 4,
                    }}>
                      {r.name}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '10px',
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      color: 'var(--color-muted)', marginBottom: 0,
                    }}>
                      {r.state}
                    </p>
                    <div style={{ flex: 1, minHeight: 16 }} />
                    {count > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12,
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
            <Link href="/regions" className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', padding: '10px 4px', minHeight: 44 }}>
              Browse all regions &rarr;
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {/* ── 6. Newsletter ─────────────────────────────── */}
      <ScrollReveal as="section" style={{ paddingBlock: '96px', background: 'var(--color-cream)' }}>
        <div className="reveal max-w-xl mx-auto px-6 sm:px-12 text-center">
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(22px, 3vw, 32px)', color: 'var(--color-ink)',
            marginBottom: '8px',
          }}>
            One independent place, every week.
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
            color: 'var(--color-muted)', marginBottom: '24px',
          }}>
            A short email with a single place worth knowing about.
          </p>
          <NewsletterSignup variant="inline" />
        </div>
      </ScrollReveal>
    </>
  )
}
