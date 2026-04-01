import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalBadge } from '@/lib/verticalUrl'

const VERTICAL_INFO = {
  sba: { name: 'Small Batch Atlas', desc: 'Craft breweries, wineries, distilleries, cideries and cellar doors across Australia.', emoji: '🍷', url: 'https://smallbatchatlas.com.au', color: 'bg-amber-50 border-amber-200' },
  collection: { name: 'Collection Atlas', desc: 'Museums, galleries, heritage sites and cultural centres worth visiting.', emoji: '🏛️', url: 'https://collectionatlas.com.au', color: 'bg-purple-50 border-purple-200' },
  craft: { name: 'Craft Atlas', desc: 'Makers, artists and studios — ceramics, textiles, jewellery, glass and more.', emoji: '🎨', url: 'https://craftatlas.com.au', color: 'bg-rose-50 border-rose-200' },
  fine_grounds: { name: 'Fine Grounds Atlas', desc: 'Specialty coffee roasters and the best independent cafes in every state.', emoji: '☕', url: 'https://finegroundsatlas.com.au', color: 'bg-orange-50 border-orange-200' },
  rest: { name: 'Rest Atlas', desc: 'Boutique hotels, farm stays, glamping, cottages and special places to stay.', emoji: '🏨', url: 'https://restatlas.com.au', color: 'bg-blue-50 border-blue-200' },
  field: { name: 'Field Atlas', desc: 'Swimming holes, waterfalls, lookouts, gorges and natural places to explore.', emoji: '🌿', url: 'https://fieldatlas.com.au', color: 'bg-green-50 border-green-200' },
  corner: { name: 'Corner Atlas', desc: 'Independent bookshops, record stores, homewares and the best retail therapy.', emoji: '📚', url: 'https://corneratlas.com.au', color: 'bg-cyan-50 border-cyan-200' },
  found: { name: 'Found Atlas', desc: 'Vintage stores, op shops, antique dealers and weekend markets.', emoji: '🔍', url: 'https://foundatlas.com.au', color: 'bg-yellow-50 border-yellow-200' },
  table: { name: 'Table Atlas', desc: 'Farm gates, bakeries, food producers, providores and cooking schools.', emoji: '🍽️', url: 'https://tableatlas.com.au', color: 'bg-red-50 border-red-200' },
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
      <h1 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl font-bold">Explore the network</h1>
      <p className="mt-2 text-[var(--color-muted)] max-w-xl">
        Nine independent directories, each dedicated to a corner of Australian culture. Browse them all from here.
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {Object.entries(VERTICAL_INFO).map(([key, info]) => (
          <div key={key} className={`rounded-xl border p-6 ${info.color} transition-shadow hover:shadow-md`}>
            <div className="flex items-start justify-between">
              <div>
                <span className="text-2xl">{info.emoji}</span>
                <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold mt-2">{info.name}</h2>
                <p className="text-sm text-[var(--color-muted)] mt-1 leading-relaxed">{info.desc}</p>
              </div>
              {counts[key] > 0 && (
                <span className="text-xs font-medium text-[var(--color-muted)] bg-white/70 px-2.5 py-1 rounded-full">
                  {counts[key].toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Link
                href={`/search?vertical=${key}`}
                className="text-sm font-medium text-[var(--color-sage)] hover:text-[var(--color-sage-dark)] transition-colors"
              >
                Browse listings →
              </Link>
              <a
                href={info.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
              >
                Visit site ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
