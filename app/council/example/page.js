import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { computeRegionMetrics } from '@/lib/analytics/regionMetrics'
import RegionReport from '@/components/council/RegionReport'

export const dynamic = 'force-dynamic'

// Public example of the council deliverable, populated from one real region's
// live Atlas numbers so a prospective council sees the actual output. Linked
// from /for-councils. Falls back across a few well-populated regions in case
// the primary example region is renamed.
const EXAMPLE_SLUGS = ['launceston-tamar-valley', 'hobart', 'barossa-valley']

export const metadata = {
  title: 'Example regional report | Australian Atlas for Councils',
  description: 'See the regional performance report Australian Atlas produces for partner councils — built from real, verified network data.',
}

export default async function CouncilExampleReport() {
  const sb = getSupabaseAdmin()

  let region = null
  for (const slug of EXAMPLE_SLUGS) {
    // Live regions only — never showcase a draft.
    const { data } = await sb.from('regions').select('id, slug, name, state').eq('slug', slug).eq('status', 'live').maybeSingle()
    if (data) { region = data; break }
  }

  if (!region) {
    return (
      <div style={{ padding: '4rem 1.5rem', textAlign: 'center', fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
        Example report is being prepared.
      </div>
    )
  }

  const since = new Date(Date.now() - 90 * 86400000).toISOString()
  const metrics = await computeRegionMetrics(sb, region, { since, limit: 10 })

  return <RegionReport metrics={metrics} variant="example" rangeLabel="Last 90 days" />
}
