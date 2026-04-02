import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalBadge } from '@/lib/verticalUrl'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

const VERTICAL_INFO = {
  sba: { name: 'Small Batch Atlas', desc: 'Craft breweries, wineries, distilleries, cideries and cellar doors across Australia.', url: 'https://smallbatchatlas.com.au' },
  collection: { name: 'Collection Atlas', desc: 'Museums, galleries, heritage sites and cultural centres worth visiting.', url: 'https://collectionatlas.com.au' },
  craft: { name: 'Craft Atlas', desc: 'Makers, artists and studios — ceramics, textiles, jewellery, glass and more.', url: 'https://craftatlas.com.au' },
  fine_grounds: { name: 'Fine Grounds Atlas', desc: 'Specialty coffee roasters and the best independent cafes in every state.', url: 'https://finegroundsatlas.com.au' },
  rest: { name: 'Rest Atlas', desc: 'Boutique hotels, farm stays, glamping, cottages and special places to stay.', url: 'https://restatlas.com.au' },
  field: { name: 'Field Atlas', desc: 'Swimming holes, waterfalls, lookouts, gorges and natural places to explore.', url: 'https://fieldatlas.com.au' },
  corner: { name: 'Corner Atlas', desc: 'Independent bookshops, record stores, homewares and the best retail therapy.', url: 'https://corneratlas.com.au' },
  found: { name: 'Found Atlas', desc: 'Vintage stores, op shops, antique dealers and weekend markets.', url: 'https://foundatlas.com.au' },
  table: { name: 'Table Atlas', desc: 'Farm gates, bakeries, food producers, providores and cooking schools.', url: 'https://tableatlas.com.au' },
}

async function getVerticalCounts() {
  try {
    const sb = getSupabaseAdmin()
    const verticals = Object.keys(VERTICAL_INFO)
    const counts = {}
    for (const v of verticals) {
      const { count } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('vertical', v).eq('status', 'active')
      counts[v] = count || 0
    }
    return counts
  } catch {
    return {}
  }
}

export const metadata = {
  title: 'Explore — Australian Atlas',
  description: 'Browse all nine Australian Atlas directories by category.',
}

export default async function ExplorePage() {
  const counts = await getVerticalCounts()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Explore the network</h1>
      <p className="mt-2 max-w-xl" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'var(--color-muted)' }}>
        Nine independent directories, each dedicated to a corner of Australian culture. Browse them all from here.
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {Object.entries(VERTICAL_INFO).map(([key, info]) => {
          const vs = VERTICAL_STYLES[key]
          return (
            <div
              key={key}
              className="rounded-xl p-6 transition-shadow hover:shadow-md"
              style={{
                backgroundColor: vs?.bg || '#F1EFE8',
                borderLeft: `3px solid ${vs?.text || '#5F5E5A'}`,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full mb-3"
                    style={{ backgroundColor: 'rgba(255,255,255,0.7)', color: vs?.text || '#5F5E5A', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px' }}
                  >
                    {vs?.label || key}
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px' }} className="text-[var(--color-ink)]">{info.name}</h2>
                  <p className="mt-1 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'var(--color-muted)' }}>{info.desc}</p>
                </div>
                {counts[key] > 0 && (
                  <span className="bg-white/70 px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px', color: vs?.text || 'var(--color-muted)' }}>
                    {counts[key].toLocaleString()}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href={`/search?vertical=${key}`}
                  className="hover:opacity-80 transition-opacity"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: vs?.text || 'var(--color-accent)' }}
                >
                  Browse listings →
                </Link>
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--color-ink)] transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'var(--color-muted)' }}
                >
                  Visit site ↗
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
