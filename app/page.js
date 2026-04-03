import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HomeSearchBar from '@/components/HomeSearchBar'
import HomeMapBackground from '@/components/HomeMapBackground'
import MapCountRotator from '@/components/MapCountRotator'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

const verticals = [
  { key: 'sba', name: 'Small Batch Atlas', desc: 'Craft breweries, wineries, distilleries, cideries and cellar doors', url: 'https://smallbatchatlas.com.au' },
  { key: 'collection', name: 'Collection Atlas', desc: 'Museums, galleries, heritage sites and cultural centres', url: 'https://collectionatlas.com.au' },
  { key: 'craft', name: 'Craft Atlas', desc: 'Makers, artists and studios across every discipline', url: 'https://craftatlas.com.au' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', desc: 'Specialty coffee roasters and independent cafes', url: 'https://finegroundsatlas.com.au' },
  { key: 'rest', name: 'Rest Atlas', desc: 'Boutique hotels, farm stays, glamping and cottages', url: 'https://restatlas.com.au' },
  { key: 'field', name: 'Field Atlas', desc: 'Swimming holes, waterfalls, lookouts and natural places', url: 'https://fieldatlas.com.au' },
  { key: 'corner', name: 'Corner Atlas', desc: 'Bookshops, record stores, homewares and indie retail', url: 'https://corneratlas.com.au' },
  { key: 'found', name: 'Found Atlas', desc: 'Vintage stores, op shops, antique dealers and markets', url: 'https://foundatlas.com.au' },
  { key: 'table', name: 'Table Atlas', desc: 'Farm gates, bakeries, food producers and providores', url: 'https://tableatlas.com.au' },
]

const images = {
  sba: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&q=80',
  collection: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&q=80',
  craft: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=80',
  fine_grounds: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
  rest: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80',
  field: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&q=80',
  corner: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&q=80',
  found: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=80',
  table: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600&q=80',
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
    return { listings: count || 0, regions: regionCount || 0, verticalCounts }
  } catch {
    return { listings: 0, regions: 0, verticalCounts: {} }
  }
}

async function getLatestArticles() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('articles')
      .select('id, title, slug, excerpt, hero_image_url, author, published_at, vertical, category')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(6)
    return data || []
  } catch {
    return []
  }
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', atlas: 'Atlas',
}

export default async function Home() {
  const [stats, articles] = await Promise.all([getStats(), getLatestArticles()])

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

        <p className="mt-5 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', color: 'var(--color-muted)' }}>
          Craft producers, boutique stays, makers, galleries, natural places, specialty coffee, independent shops and food producers. Curated, mapped, and editorially grounded.
        </p>

        {/* Search bar */}
        <HomeSearchBar />
      </section>

      {/* Atlas Grid */}
      <section className="px-4 sm:px-6 pb-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {verticals.map(v => {
            const vs = VERTICAL_STYLES[v.key]
            return (
              <a
                key={v.key}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative rounded-xl overflow-hidden aspect-[16/9] block"
              >
                <img
                  src={images[v.key]}
                  alt={v.name}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end p-5">
                  <div className="flex items-end justify-between">
                    <div>
                      {/* Vertical badge pill */}
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium mb-2"
                        style={{ backgroundColor: vs?.bg || '#F1EFE8', color: vs?.text || '#5F5E5A' }}
                      >
                        {vs?.label || v.name.replace(' Atlas', '')}
                      </span>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px' }} className="text-white leading-tight">{v.name}</h2>
                      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px' }} className="text-white/80 mt-0.5">{v.desc}</p>
                    </div>
                    {stats.verticalCounts[v.key] > 0 && (
                      <span className="text-xs font-medium text-white/90 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full whitespace-nowrap" style={{ fontFamily: 'var(--font-body)' }}>
                        {stats.verticalCounts[v.key].toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Link
                      href={`/search?vertical=${v.key}`}
                      className="hover:text-white/80 transition-colors relative z-10"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: '#fff' }}
                    >
                      Browse listings &rarr;
                    </Link>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px' }} className="text-white/60 group-hover:text-white transition-colors">
                      Visit atlas ↗
                    </span>
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
              { name: 'Barossa Valley', state: 'SA', img: 'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=400&q=80' },
              { name: 'Mornington Peninsula', state: 'VIC', img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=80' },
              { name: 'Yarra Valley', state: 'VIC', img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=80' },
              { name: 'Byron Hinterland', state: 'NSW', img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80' },
              { name: 'Blue Mountains', state: 'NSW', img: 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=400&q=80' },
              { name: 'Adelaide Hills', state: 'SA', img: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400&q=80' },
            ].map(r => (
              <Link
                key={r.name}
                href={`/regions/${r.name.toLowerCase().replace(/\s+/g, '-')}`}
                className="group relative rounded-xl overflow-hidden aspect-[3/2]"
              >
                <img src={r.img} alt={r.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '18px' }} className="text-white">{r.name}</h3>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '12px' }} className="text-white/70">{r.state}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link href="/regions" className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
              Browse all regions
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Journal */}
      {articles.length > 0 && (
        <section className="py-16 px-4 sm:px-6 bg-white border-y border-[var(--color-border)]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10">
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Journal</h2>
              <p className="mt-3 max-w-xl mx-auto" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'var(--color-muted)' }}>
                Stories, guides and profiles from across the network.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map(article => (
                <Link
                  key={article.id}
                  href={`/journal/${article.slug}`}
                  className="group block rounded-xl overflow-hidden border border-[var(--color-border)] bg-white hover:shadow-lg transition-shadow"
                >
                  {article.hero_image_url ? (
                    <div className="aspect-[16/9] overflow-hidden">
                      <img
                        src={article.hero_image_url}
                        alt={article.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-gradient-to-br from-[var(--color-sage)]/10 to-[var(--color-sage)]/5 flex items-center justify-center">
                      <svg className="w-10 h-10 text-[var(--color-sage)] opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {article.vertical && (
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px', color: VERTICAL_STYLES[article.vertical]?.text || 'var(--color-accent)' }}>
                          {VERTICAL_LABELS[article.vertical] || article.vertical}
                        </span>
                      )}
                      {article.category && (
                        <>
                          <span className="text-[var(--color-border)]">·</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '11px', color: 'var(--color-muted)' }}>{article.category}</span>
                        </>
                      )}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '18px' }} className="leading-tight group-hover:text-[var(--color-accent)] transition-colors">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="mt-2 line-clamp-2 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'var(--color-muted)' }}>{article.excerpt}</p>
                    )}
                    {article.published_at && (
                      <p className="mt-3" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '11px', color: 'var(--color-muted)' }}>
                        {new Date(article.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-8 text-center">
              <Link href="/journal" className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
                Read all articles
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* For Partners */}
      <section className="bg-[var(--color-ink)] text-white py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-2xl sm:text-3xl">For tourism partners and regional councils</h2>

          <div className="mt-8 space-y-5">
            <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px' }}>
              Australian Atlas covers every region in the country with verified, editorially curated listings across nine categories.
            </p>
            <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px' }}>
              Regional councils and tourism bodies can co-create regional content and access network data for their area.
            </p>
            <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px' }}>
              If you represent a region, a council, or a tourism body, we&apos;d like to talk.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 bg-[var(--color-accent)] text-white px-6 py-3 rounded-full hover:opacity-90 transition-opacity"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}
            >
              View plans
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </a>
            <a
              href="/council/login"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white px-6 py-3 rounded-full border border-white/20 transition-colors"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}
            >
              Council login
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
