import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const verticals = [
  { key: 'sba', name: 'Small Batch Atlas', desc: 'Craft breweries, wineries & distilleries', emoji: '🍷', color: 'from-amber-600/80' },
  { key: 'collection', name: 'Collection Atlas', desc: 'Museums, galleries & heritage sites', emoji: '🏛️', color: 'from-purple-600/80' },
  { key: 'craft', name: 'Craft Atlas', desc: 'Makers, artists & studios', emoji: '🎨', color: 'from-rose-600/80' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', desc: 'Specialty coffee roasters & cafes', emoji: '☕', color: 'from-orange-600/80' },
  { key: 'rest', name: 'Rest Atlas', desc: 'Boutique hotels, farm stays & glamping', emoji: '🏨', color: 'from-blue-600/80' },
  { key: 'field', name: 'Field Atlas', desc: 'Swimming holes, waterfalls & nature', emoji: '🌿', color: 'from-green-600/80' },
  { key: 'corner', name: 'Corner Atlas', desc: 'Bookshops, record stores & indie retail', emoji: '📚', color: 'from-cyan-600/80' },
  { key: 'found', name: 'Found Atlas', desc: 'Vintage, op shops & markets', emoji: '🔍', color: 'from-yellow-600/80' },
  { key: 'table', name: 'Table Atlas', desc: 'Farm gates, bakeries & food producers', emoji: '🍽️', color: 'from-red-600/80' },
]

const images = {
  sba: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&q=80',
  collection: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&q=80',
  craft: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=80',
  fine_grounds: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
  rest: 'https://images.unsplash.com/photo-1566073771553-6b68e2e9e09c?w=600&q=80',
  field: 'https://images.unsplash.com/photo-1470770841497-f3375fbb6d74?w=600&q=80',
  corner: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&q=80',
  found: 'https://images.unsplash.com/photo-1558618666-fcd25c85f1d7?w=600&q=80',
  table: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600&q=80',
}

async function getStats() {
  try {
    const sb = getSupabaseAdmin()
    const { count } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active')
    const { count: regionCount } = await sb.from('regions').select('*', { count: 'exact', head: true })
    return { listings: count || 0, regions: regionCount || 0 }
  } catch {
    return { listings: 0, regions: 0 }
  }
}

export default async function Home() {
  const stats = await getStats()

  return (
    <>
      {/* Hero */}
      <section className="text-center px-4 sm:px-6 pt-16 pb-12 max-w-3xl mx-auto">
        <h1 className="font-[family-name:var(--font-serif)] text-4xl sm:text-5xl md:text-6xl font-bold leading-tight tracking-tight">
          Discover Australia,<br />one atlas at a time
        </h1>
        <p className="mt-5 text-lg text-[var(--color-muted)] leading-relaxed max-w-xl mx-auto">
          Nine curated directories celebrating the best of Australian craft, culture, hospitality and nature — all in one place.
        </p>

        {/* Search bar */}
        <div className="mt-8 max-w-lg mx-auto">
          <Link href="/search" className="flex items-center gap-3 bg-white border border-[var(--color-border)] rounded-full px-5 py-3.5 shadow-sm hover:shadow-md transition-shadow group">
            <svg className="w-5 h-5 text-[var(--color-muted)] group-hover:text-[var(--color-sage)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-[var(--color-muted)] text-sm">Search across all atlases...</span>
          </Link>
        </div>

        {/* Stats */}
        {stats.listings > 0 && (
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-[var(--color-muted)]">
            <span><strong className="text-[var(--color-ink)]">{stats.listings.toLocaleString()}</strong> listings</span>
            <span className="text-[var(--color-border)]">|</span>
            <span><strong className="text-[var(--color-ink)]">9</strong> atlases</span>
            <span className="text-[var(--color-border)]">|</span>
            <span><strong className="text-[var(--color-ink)]">{stats.regions}</strong> regions</span>
          </div>
        )}
      </section>

      {/* Atlas Grid */}
      <section className="px-4 sm:px-6 pb-16 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {verticals.map(v => (
            <Link
              key={v.key}
              href={`/explore?vertical=${v.key}`}
              className="group relative block rounded-xl overflow-hidden aspect-[16/9]"
            >
              <img
                src={images[v.key]}
                alt={v.name}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${v.color} to-transparent`} />
              <div className="absolute inset-0 flex flex-col justify-end p-5">
                <span className="text-2xl mb-1">{v.emoji}</span>
                <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold text-white leading-tight">{v.name}</h2>
                <p className="text-sm text-white/80 mt-0.5">{v.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Regions CTA */}
      <section className="bg-white border-y border-[var(--color-border)] py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-[family-name:var(--font-serif)] text-3xl font-bold">Explore by region</h2>
          <p className="mt-3 text-[var(--color-muted)] leading-relaxed">
            From the Barossa Valley to Bruny Island, discover what makes each Australian region special across all nine atlases.
          </p>
          <Link href="/regions" className="mt-6 inline-flex items-center gap-2 bg-[var(--color-sage)] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[var(--color-sage-dark)] transition-colors">
            Browse all regions
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </section>
    </>
  )
}
