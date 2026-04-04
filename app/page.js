import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import TrailPromptInput from '@/components/TrailPromptInput'
import HomeMapBackground from '@/components/HomeMapBackground'
import MapCountRotator from '@/components/MapCountRotator'
import { getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

const verticals = [
  { key: 'sba', name: 'Small Batch Atlas', tag: 'Small Batch', desc: 'Craft breweries, wineries, distilleries, cideries and cellar doors', url: 'https://smallbatchatlas.com.au' },
  { key: 'collection', name: 'Collection Atlas', tag: 'Collections', desc: 'Museums, galleries, heritage sites and cultural centres', url: 'https://collectionatlas.com.au' },
  { key: 'craft', name: 'Craft Atlas', tag: 'Craft', desc: 'Makers, artists and studios across every discipline', url: 'https://craftatlas.com.au' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', tag: 'Fine Grounds', desc: 'Specialty coffee roasters and independent cafes', url: 'https://finegroundsatlas.com.au' },
  { key: 'rest', name: 'Rest Atlas', tag: 'Rest', desc: 'Boutique hotels, farm stays, glamping and cottages', url: 'https://restatlas.com.au' },
  { key: 'field', name: 'Field Atlas', tag: 'Field', desc: 'Swimming holes, waterfalls, lookouts and natural places', url: 'https://fieldatlas.com.au' },
  { key: 'corner', name: 'Corner Atlas', tag: 'Corner', desc: 'Bookshops, record stores, homewares and indie retail', url: 'https://corneratlas.com.au' },
  { key: 'found', name: 'Found Atlas', tag: 'Found', desc: 'Vintage stores, op shops, antique dealers and markets', url: 'https://foundatlas.com.au' },
  { key: 'table', name: 'Table Atlas', tag: 'Table', desc: 'Farm gates, bakeries, food producers and providores', url: 'https://tableatlas.com.au' },
]

const VERTICAL_CARD_COLORS = {
  sba:          { bg: '#2D1F14', text: '#E8D5C4' },
  collection:   { bg: '#1A2C28', text: '#C4D8D0' },
  craft:        { bg: '#3D2318', text: '#E0C8B8' },
  fine_grounds: { bg: '#1C1A10', text: '#D4D0B8' },
  rest:         { bg: '#1E2535', text: '#C4CCD8' },
  field:        { bg: '#162418', text: '#C0D4C4' },
  corner:       { bg: '#2A1F30', text: '#D0C4D8' },
  found:        { bg: '#2C2010', text: '#D8CCB4' },
  table:        { bg: '#1A2410', text: '#C8D4B8' },
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
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
    ])
    // Get per-vertical counts
    const verticalCounts = {}
    for (const v of verticals) {
      const { count: c } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('vertical', v.key).eq('status', 'active')
      verticalCounts[v.key] = c || 0
    }

    // Get listing counts for homepage region cards (bounding box queries)
    const regionCounts = {}
    for (const [name, geo] of Object.entries(REGION_GEO)) {
      const { count: rc } = await sb
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('lat', geo.lat - geo.r)
        .lte('lat', geo.lat + geo.r)
        .gte('lng', geo.lng - geo.r)
        .lte('lng', geo.lng + geo.r)
      regionCounts[name] = rc || 0
    }

    return { listings: count || 0, regions: regionCount || 0, verticalCounts, regionCounts }
  } catch {
    return { listings: 0, regions: 0, verticalCounts: {}, regionCounts: {} }
  }
}

async function getLatestArticles() {
  // Pull journal content directly from vertical Supabase databases
  // Starting with SBA; extend to other verticals as their Journal content grows
  const allArticles = []

  try {
    const sbaClient = getVerticalClient('sba')
    const { data: sbaArticles } = await sbaClient
      .from('articles')
      .select('id, title, slug, deck, category, author, hero_image_url, published_at, tags, is_partner_content')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(6)
    if (sbaArticles) {
      allArticles.push(...sbaArticles.map(a => ({
        ...a,
        vertical: 'sba',
        excerpt: a.deck || null,
        article_url: `https://smallbatchatlas.com.au/journal/${a.slug}`,
      })))
    }
  } catch { /* SBA journal not available */ }

  // Sort all articles by published_at descending, take top 3
  allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
  return allArticles.slice(0, 3)
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
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', atlas: 'Atlas',
}

export default async function Home() {
  const [stats, articlesRaw, featuredByVertical] = await Promise.all([getStats(), getLatestArticles(), getFeaturedByVertical()])
  const articles = articlesRaw.length > 0 ? articlesRaw : []

  return (
    <>
      {/* Hero */}
      <section className="relative text-center px-4 sm:px-6 pt-24 pb-20 max-w-4xl mx-auto">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.01em' }} className="text-4xl sm:text-5xl md:text-6xl leading-[1.1] text-[var(--color-ink)]">
          The complete guide to<br /><em className="not-italic" style={{ fontStyle: 'italic' }}>independent</em> Australia.
        </h1>

        {/* Stats as credentials */}
        {stats.listings > 0 && (
          <div className="mt-6 flex items-center justify-center gap-4 sm:gap-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', letterSpacing: '0.02em' }}>
            <span className="text-[var(--color-ink)]">{stats.listings.toLocaleString()} verified listings</span>
            <span className="text-[var(--color-accent)]" style={{ fontSize: '6px' }}>●</span>
            <span className="text-[var(--color-ink)]">9 atlases</span>
            <span className="text-[var(--color-accent)]" style={{ fontSize: '6px' }}>●</span>
            <span className="text-[var(--color-ink)]">{stats.regions || '30'} regions</span>
          </div>
        )}

        {/* Search bar */}
        <HomeSearchBar />
      </section>

      {/* Trail Builder Section */}
      <section className="py-20 px-4 sm:px-6 bg-white border-t border-[var(--color-border)]">
        <div className="max-w-4xl mx-auto text-center">
          <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 12, fontFamily: 'var(--font-body)', fontWeight: 600 }}>Discovery Trails</p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">
            Plan a trip in plain English
          </h2>
          <p className="mt-4 max-w-xl mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'var(--color-muted)' }}>
            Tell us where you want to go and what you&apos;re into. We&apos;ll build a day-by-day itinerary from real, verified venues across all nine atlases.
          </p>

          {/* Trail prompt input */}
          <TrailPromptInput />

          {/* Example trails */}
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-5 text-left">
            {[
              { query: 'Weekend wine trail through the Barossa', region: 'Barossa Valley, SA', days: '2 days', stops: '8 stops', verticals: ['Small Batch', 'Table', 'Rest'] },
              { query: 'Three day art and makers tour of Hobart', region: 'Hobart, TAS', days: '3 days', stops: '12 stops', verticals: ['Collection', 'Craft', 'Fine Grounds'] },
              { query: 'Day trip to Mornington Peninsula wineries', region: 'Mornington Peninsula, VIC', days: '1 day', stops: '5 stops', verticals: ['Small Batch', 'Table'] },
            ].map((example, i) => (
              <Link
                key={i}
                href={`/itinerary?q=${encodeURIComponent(example.query)}`}
                className="group block rounded-xl border border-[var(--color-border)] p-5 hover:border-[var(--color-sage)] hover:shadow-sm transition-all"
                style={{ background: 'var(--color-bg)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px', color: 'var(--color-sage)' }}>{example.region}</span>
                  <span style={{ color: 'var(--color-border)', fontSize: 10 }}>&middot;</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '11px', color: 'var(--color-muted)' }}>{example.days}</span>
                </div>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '17px', color: 'var(--color-ink)', lineHeight: 1.35, marginBottom: 10 }}>
                  {example.query}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {example.verticals.map(v => (
                    <span key={v} style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '10px', color: 'var(--color-muted)', background: 'var(--color-cream)', padding: '2px 8px', borderRadius: 100 }}>{v}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8">
            <Link href="/trails" className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
              Browse all trails
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* From the Journal */}
      {articles.length > 0 && (
      <section className="py-20 px-4 sm:px-6" style={{ background: 'var(--color-cream)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 8, fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              From the Journal
            </p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">
              Dispatches from the network
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {articles.map(article => (
              <a
                key={article.id}
                href={article.article_url || `https://smallbatchatlas.com.au/journal/${article.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-xl overflow-hidden"
                style={{ background: '#fff', border: '1px solid var(--color-border)' }}
              >
                {article.hero_image_url ? (
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={article.hero_image_url}
                      alt={article.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        {article.vertical && (
                          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                            {VERTICAL_LABELS[article.vertical] || article.vertical}
                          </span>
                        )}
                        {article.category && (
                          <>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 6 }}>&#9679;</span>
                            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
                              {article.category}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '17px', lineHeight: 1.3, color: '#fff', margin: 0 }}>
                        {article.title}
                      </h3>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      {article.vertical && (
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-sage)' }}>
                          {VERTICAL_LABELS[article.vertical] || article.vertical}
                        </span>
                      )}
                      {article.category && (
                        <>
                          <span style={{ color: 'var(--color-border)', fontSize: 6 }}>&#9679;</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                            {article.category}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '18px', lineHeight: 1.3, color: 'var(--color-ink)', marginBottom: 0 }}>
                      {article.title}
                    </h3>
                  </div>
                )}
                {article.excerpt && (
                  <div className="px-5 pb-5">
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'var(--color-muted)', lineHeight: 1.5, margin: 0 }}>
                      {article.excerpt}
                    </p>
                  </div>
                )}
              </a>
            ))}
          </div>

          <div className="mt-8 text-center">
            <a
              href="https://smallbatchatlas.com.au/journal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:opacity-80 transition-opacity"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}
            >
              Read the Journal
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </a>
          </div>
        </div>
      </section>
      )}

      {/* Atlas Grid */}
      <section className="px-4 sm:px-6 py-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {verticals.map(v => {
            const colors = VERTICAL_CARD_COLORS[v.key]
            return (
              <a
                key={v.key}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block rounded-xl overflow-hidden"
                style={{ background: colors.bg }}
              >
                {/* Dot-grid texture overlay */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  opacity: 0.06,
                  backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                  color: colors.text,
                }} />
                <div className="relative p-6 flex flex-col" style={{ minHeight: 200 }}>
                  {/* Tag */}
                  <p style={{
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
                    letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: colors.text, opacity: 0.5, marginBottom: 16, lineHeight: 1,
                  }}>
                    {v.tag}
                  </p>
                  {/* Name */}
                  <h2 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
                    color: colors.text, lineHeight: 1.2, marginBottom: 6,
                  }}>
                    {v.name}
                  </h2>
                  {/* Description */}
                  <p style={{
                    fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13,
                    color: colors.text, opacity: 0.65, lineHeight: 1.5, marginBottom: 0,
                  }}>
                    {v.desc}
                  </p>
                  {/* Spacer */}
                  <div style={{ flex: 1, minHeight: 20 }} />
                  {/* Footer: count + links */}
                  <div className="flex items-end justify-between">
                    {stats.verticalCounts[v.key] > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                        color: colors.text, opacity: 0.4,
                      }}>
                        {stats.verticalCounts[v.key].toLocaleString()} listings
                      </span>
                    )}
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/search?vertical=${v.key}`}
                        className="relative z-10 transition-opacity hover:opacity-70"
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: colors.text }}
                      >
                        Browse
                      </Link>
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: colors.text, opacity: 0.5 }} className="group-hover:opacity-80 transition-opacity">
                        Visit &nearr;
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      </section>

      {/* Map Section */}
      <section className="relative border-y border-[var(--color-border)] overflow-hidden" style={{ height: '520px' }}>
        {/* Real Mapbox map as background */}
        <HomeMapBackground />

        {/* Subtle vignette overlay for text readability */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.6) 70%, rgba(255,255,255,0.85) 100%)',
        }} />

        {/* Centred content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4">
          <MapCountRotator verticalCounts={stats.verticalCounts} totalListings={stats.listings} />
          <p className="mt-3 text-center" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', color: 'var(--color-muted)' }}>All nine atlases, filterable and explorable</p>
          <Link href="/map" className="mt-6 inline-flex items-center gap-2 bg-[var(--color-accent)] text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
            Open full map
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>

          {/* Vertical legend pills — using VerticalBadge colors */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {verticals.map(v => {
              const vs = VERTICAL_STYLES[v.key]
              const slug = { sba: 'small-batch', collection: 'collections', craft: 'craft', fine_grounds: 'fine-grounds', rest: 'rest', field: 'field', corner: 'corner', found: 'found', table: 'table' }[v.key]
              return (
                <Link key={v.key} href={`/map?vertical=${slug}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-[var(--color-border)] hover:underline hover:underline-offset-2 cursor-pointer transition-all" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '11px', color: vs?.text || 'var(--color-muted)', textDecorationColor: vs?.text || 'var(--color-muted)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: vs?.text || '#6B6760' }} />
                  {vs?.label || v.name.replace(' Atlas', '')}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Explore by Region */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Explore by region</h2>
            <p className="mt-3 max-w-xl mx-auto" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'var(--color-muted)' }}>
              Every listing in every region, across all nine atlases.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { name: 'Barossa Valley', state: 'SA' },
              { name: 'Mornington Peninsula', state: 'VIC' },
              { name: 'Yarra Valley', state: 'VIC' },
              { name: 'Byron Hinterland', state: 'NSW' },
              { name: 'Blue Mountains', state: 'NSW' },
              { name: 'Adelaide Hills', state: 'SA' },
            ].map(r => {
              const count = stats.regionCounts[r.name]
              const accent = REGION_ACCENT_COLORS[r.name] || 'var(--color-sage)'
              return (
                <Link
                  key={r.name}
                  href={`/regions/${r.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className="group block rounded-xl overflow-hidden hover:shadow-sm transition-all"
                  style={{
                    background: '#fff',
                    border: '1px solid var(--color-border, #e8e3da)',
                    borderTop: `3px solid ${accent}`,
                  }}
                >
                  <div className="p-6 flex flex-col" style={{ minHeight: 140 }}>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20,
                      color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 4,
                    }}>
                      {r.name}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12,
                      color: 'var(--color-muted)', letterSpacing: '0.04em', marginBottom: 0,
                    }}>
                      {r.state}
                    </p>
                    <div style={{ flex: 1, minHeight: 16 }} />
                    {count > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
                        color: 'var(--color-muted)', opacity: 0.7,
                      }}>
                        {count} listings across the network
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="mt-8 text-center">
            <Link href="/regions" className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
              Browse all regions
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* For Partners */}
      <section className="bg-[var(--color-ink)] text-white py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-2xl sm:text-3xl">For tourism partners and regional councils</h2>

          <div className="mt-8 space-y-5">
            <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px' }}>
              Nine curated atlases. {stats.listings > 0 ? stats.listings.toLocaleString() : '6,881'} verified listings. {stats.regions || 46} regions. Australian Atlas maps the independent businesses and cultural spaces that make regions worth visiting &mdash; the layer that ATDW and council tourism sites typically don&apos;t cover.
            </p>
            <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px' }}>
              Council partnerships start with understanding what&apos;s already in your region on the network, then extend into content co-creation, editorial trails, regional analytics, and verified data access. Plans run annually from $249.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/for-councils"
              className="inline-flex items-center gap-2 bg-[var(--color-accent)] text-white px-6 py-3 rounded-full hover:opacity-90 transition-opacity"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}
            >
              Learn more
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
            <a
              href="mailto:councils@australianatlas.com.au"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white px-6 py-3 rounded-full border border-white/20 transition-colors"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}
            >
              councils@australianatlas.com.au
            </a>
            <a
              href="/council/login"
              className="text-white/50 hover:text-white/80 transition-colors"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Council login
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
