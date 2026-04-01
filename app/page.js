import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const verticals = [
  { key: 'sba', name: 'Small Batch Atlas', desc: 'Craft breweries, wineries, distilleries, cideries and cellar doors', emoji: '🍷', color: '#C49A3C', url: 'https://smallbatchatlas.com.au' },
  { key: 'collection', name: 'Collection Atlas', desc: 'Museums, galleries, heritage sites and cultural centres', emoji: '🏛️', color: '#7A6B8A', url: 'https://collectionatlas.com.au' },
  { key: 'craft', name: 'Craft Atlas', desc: 'Makers, artists and studios across every discipline', emoji: '🎨', color: '#C1603A', url: 'https://craftatlas.com.au' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', desc: 'Specialty coffee roasters and independent cafes', emoji: '☕', color: '#8A7055', url: 'https://finegroundsatlas.com.au' },
  { key: 'rest', name: 'Rest Atlas', desc: 'Boutique hotels, farm stays, glamping and cottages', emoji: '🏨', color: '#5A8A9A', url: 'https://restatlas.com.au' },
  { key: 'field', name: 'Field Atlas', desc: 'Swimming holes, waterfalls, lookouts and natural places', emoji: '🌿', color: '#4A7C59', url: 'https://fieldatlas.com.au' },
  { key: 'corner', name: 'Corner Atlas', desc: 'Bookshops, record stores, homewares and indie retail', emoji: '📚', color: '#5F8A7E', url: 'https://corneratlas.com.au' },
  { key: 'found', name: 'Found Atlas', desc: 'Vintage stores, op shops, antique dealers and markets', emoji: '🔍', color: '#D4956A', url: 'https://foundatlas.com.au' },
  { key: 'table', name: 'Table Atlas', desc: 'Farm gates, bakeries, food producers and providores', emoji: '🍽️', color: '#C4634F', url: 'https://tableatlas.com.au' },
]

const images = {
  sba: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&q=80',
  collection: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&q=80',
  craft: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=80',
  fine_grounds: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
  rest: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&q=80',
  field: 'https://images.unsplash.com/photo-1470770841497-f3375fbb6d74?w=600&q=80',
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

export default async function Home() {
  const stats = await getStats()

  return (
    <>
      {/* Hero */}
      <section className="relative text-center px-4 sm:px-6 pt-20 pb-16 max-w-4xl mx-auto">
        {/* Subtle topo texture background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg stroke='%23000' stroke-width='0.5'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        <h1 className="font-[family-name:var(--font-serif)] text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight">
          The complete guide to<br />independent Australia.
        </h1>

        {/* Stats as credentials — directly under headline */}
        {stats.listings > 0 && (
          <div className="mt-6 flex items-center justify-center gap-4 sm:gap-6 text-sm">
            <span className="font-semibold text-[var(--color-ink)]">{stats.listings.toLocaleString()} verified listings</span>
            <span className="text-[var(--color-border)]">·</span>
            <span className="font-semibold text-[var(--color-ink)]">9 atlases</span>
            <span className="text-[var(--color-border)]">·</span>
            <span className="font-semibold text-[var(--color-ink)]">{stats.regions || '30'} regions</span>
          </div>
        )}

        <p className="mt-5 text-base sm:text-lg text-[var(--color-muted)] leading-relaxed max-w-2xl mx-auto">
          Craft producers, boutique stays, makers, galleries, natural places, specialty coffee, independent shops and food producers. Curated, mapped, and editorially grounded.
        </p>

        {/* Search bar */}
        <div className="mt-8 max-w-lg mx-auto">
          <Link href="/search" className="flex items-center gap-3 bg-white border-2 border-[var(--color-border)] rounded-2xl px-5 py-4 shadow-sm hover:shadow-md hover:border-[var(--color-sage)]/40 transition-all group">
            <svg className="w-5 h-5 text-[var(--color-sage)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-[var(--color-muted)] text-sm">Try &lsquo;natural wine Barossa&rsquo; or &lsquo;boutique stays near Melbourne&rsquo;...</span>
          </Link>
        </div>
      </section>

      {/* Atlas Grid */}
      <section className="px-4 sm:px-6 pb-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {verticals.map(v => (
            <div
              key={v.key}
              className="group relative rounded-xl overflow-hidden aspect-[16/9]"
            >
              <img
                src={images[v.key]}
                alt={v.name}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0" style={{
                background: `linear-gradient(to top, ${v.color}cc 0%, ${v.color}40 50%, transparent 100%)`,
              }} />
              <div className="absolute inset-0 flex flex-col justify-end p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-2xl mb-1 block">{v.emoji}</span>
                    <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold text-white leading-tight">{v.name}</h2>
                    <p className="text-sm text-white/80 mt-0.5">{v.desc}</p>
                  </div>
                  {stats.verticalCounts[v.key] > 0 && (
                    <span className="text-xs font-semibold text-white/90 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full whitespace-nowrap">
                      {stats.verticalCounts[v.key].toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Link
                    href={`/search?vertical=${v.key}`}
                    className="text-sm font-medium text-white hover:text-white/80 transition-colors"
                  >
                    Browse listings &rarr;
                  </Link>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/70 hover:text-white transition-colors"
                  >
                    Visit atlas &nearr;
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Map Section */}
      <section className="bg-white border-y border-[var(--color-border)] py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl font-bold">
              {stats.listings > 0 ? `${stats.listings.toLocaleString()} listings on one map` : 'Every listing on one map'}
            </h2>
            <p className="mt-3 text-[var(--color-muted)] max-w-xl mx-auto">
              Craft producers, boutique stays, galleries, makers and more — all plotted across Australia.
            </p>
          </div>

          {/* Map preview teaser */}
          <Link href="/map" className="block relative rounded-2xl overflow-hidden border border-[var(--color-border)] shadow-sm hover:shadow-lg transition-shadow group" style={{ height: '420px', background: 'linear-gradient(135deg, #e8e4df 0%, #d4cfc8 30%, #c8c0b6 60%, #e0dbd5 100%)' }}>
            {/* Stylised map dots pattern */}
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: `radial-gradient(circle, var(--color-sage) 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }} />

            {/* Centre content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <svg className="w-16 h-16 text-[var(--color-sage)] opacity-40 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-lg font-[family-name:var(--font-serif)] font-bold text-[var(--color-ink)] mb-1">
                {stats.listings > 0 ? `${stats.listings.toLocaleString()} pins across Australia` : 'Every listing on one map'}
              </p>
              <p className="text-sm text-[var(--color-muted)] mb-6">All nine atlases, filterable and explorable</p>
              <span className="inline-flex items-center gap-2 bg-[var(--color-sage)] text-white px-6 py-3 rounded-full text-sm font-medium shadow-lg group-hover:shadow-xl group-hover:bg-[var(--color-sage-dark)] transition-all">
                Open full map
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </span>
            </div>
          </Link>

          {/* Vertical legend pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {verticals.map(v => (
              <span key={v.key} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] px-2.5 py-1 rounded-full bg-gray-50 border border-[var(--color-border)]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                {v.name.replace(' Atlas', '')}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Explore by Region */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl font-bold">Explore by region</h2>
            <p className="mt-3 text-[var(--color-muted)] max-w-xl mx-auto">
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
                  <h3 className="font-[family-name:var(--font-serif)] text-lg font-bold text-white">{r.name}</h3>
                  <p className="text-sm text-white/70">{r.state}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link href="/regions" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-sage)] hover:text-[var(--color-sage-dark)] transition-colors">
              Browse all regions
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* For Partners */}
      <section className="bg-[var(--color-ink)] text-white py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-[family-name:var(--font-serif)] text-2xl sm:text-3xl font-bold">For tourism partners and regional councils</h2>

          <div className="mt-8 space-y-5">
            <p className="text-white/80 leading-relaxed">
              Australian Atlas covers every region in the country with verified, editorially curated listings across nine categories.
            </p>
            <p className="text-white/80 leading-relaxed">
              Regional councils and tourism bodies can co-create regional content and access network data for their area.
            </p>
            <p className="text-white/80 leading-relaxed">
              If you represent a region, a council, or a tourism body, we&apos;d like to talk.
            </p>
          </div>

          <div className="mt-8">
            <a
              href="mailto:hello@australianatlas.com.au"
              className="inline-flex items-center gap-2 bg-white text-[var(--color-ink)] px-6 py-3 rounded-full text-sm font-medium hover:bg-white/90 transition-colors"
            >
              Get in touch
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
