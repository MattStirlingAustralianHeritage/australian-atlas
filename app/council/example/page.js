import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { computeRegionMetrics, computeRegionSessions } from '@/lib/analytics/regionMetrics'
import { computeWeeklyTrends, computeBenchmarks } from '@/lib/council/insights'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'
import RegionReport from '@/components/council/RegionReport'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const { data } = await sb.from('regions').select('id, slug, name, state, center_lat, center_lng').eq('slug', slug).eq('status', 'live').maybeSingle()
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
  // Same intelligence stack as the real council report — the example IS the
  // sales pitch, so it shows the full deliverable. All extras best-effort.
  const [metrics, sessions, trendsAll, benchmarksAll, verticalRows] = await Promise.all([
    computeRegionMetrics(sb, region, { since, limit: 10 }),
    computeRegionSessions(sb, region, { since }).catch(() => null),
    computeWeeklyTrends(sb, [region], { rangeDays: 90 }).catch(() => null),
    computeBenchmarks(sb, [region], { rangeDays: 90 }).catch(() => null),
    excludeNeedsReview(excludeTestListings(
      sb.from('listings_with_region')
        .select('slug, vertical')
        .eq('status', 'active')
        .eq('region_id', region.id),
    )).limit(5000).then(({ data }) => data || [], () => []),
  ])

  const trends = trendsAll?.byRegion?.[0]
    ? {
        series: trendsAll.byRegion[0].series,
        current: trendsAll.byRegion[0].current,
        previous: trendsAll.byRegion[0].previous,
        split: trendsAll.byRegion[0].split,
      }
    : null

  const benchmark = benchmarksAll?.byRegion?.[0]?.rank
    ? {
        ...benchmarksAll.byRegion[0],
        medianClicks: benchmarksAll.medians.clicks,
        medianClicksPerListing: Number(benchmarksAll.medians.clicksPerListing?.toFixed?.(2) ?? benchmarksAll.medians.clicksPerListing),
      }
    : null

  const byVertical = verticalRows.reduce((acc, r) => {
    acc[r.vertical] = (acc[r.vertical] || 0) + 1
    return acc
  }, {})

  return (
    <RegionReport
      metrics={metrics}
      variant="example"
      rangeLabel="Last 90 days"
      sessions={sessions}
      trends={trends}
      benchmark={benchmark}
      byVertical={byVertical}
    />
  )
}
