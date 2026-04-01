import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const STATE_LABELS = {
  VIC: 'Victoria',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
}

export const metadata = {
  title: 'Regions — Australian Atlas',
  description: 'Explore Australian regions and discover the best independent places in each.',
}

async function getRegions() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('regions')
      .select('id, name, slug, state, description, listing_count')
      .order('state')
      .order('name')
    return data || []
  } catch {
    return []
  }
}

export default async function RegionsPage() {
  const regions = await getRegions()

  // Group by state
  const byState = {}
  for (const r of regions) {
    if (!byState[r.state]) byState[r.state] = []
    byState[r.state].push(r)
  }

  const stateOrder = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl font-bold">Regions</h1>
      <p className="mt-2 text-[var(--color-muted)] max-w-xl">
        Discover what makes each Australian region special — from wineries and makers to hidden swimming holes and boutique stays.
      </p>

      <div className="mt-10 space-y-10">
        {stateOrder.filter(s => byState[s]).map(state => (
          <div key={state}>
            <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold text-[var(--color-ink)] border-b border-[var(--color-border)] pb-2 mb-4">
              {STATE_LABELS[state]}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {byState[state].map(region => (
                <Link
                  key={region.id}
                  href={`/regions/${region.slug}`}
                  className="group block p-4 rounded-xl border border-[var(--color-border)] bg-white hover:shadow-md hover:border-[var(--color-sage)] transition-all"
                >
                  <h3 className="font-semibold group-hover:text-[var(--color-sage)] transition-colors">{region.name}</h3>
                  {region.description && (
                    <p className="text-sm text-[var(--color-muted)] mt-1 line-clamp-2">{region.description}</p>
                  )}
                  {region.listing_count > 0 && (
                    <p className="text-xs text-[var(--color-sage)] mt-2 font-medium">{region.listing_count} listings</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
