import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { computeRegionMetrics, computeRegionSessions } from '@/lib/analytics/regionMetrics'
import { computeWeeklyTrends, computeBenchmarks } from '@/lib/council/insights'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'
import { validateCouncilSession } from '@/lib/council-session'
import RegionReport from '@/components/council/RegionReport'

export const dynamic = 'force-dynamic'
// The report walks several pageview windows (metrics, weekly trend, benchmark);
// give it room beyond the default serverless budget.
export const maxDuration = 60

const RANGE_DAYS = { '30d': 30, '90d': 90, '1y': 365 }
const RANGE_LABELS = { '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last 12 months' }

export async function generateMetadata({ params }) {
  const { region: slug } = await params
  const sb = getSupabaseAdmin()
  // Public route — scope to published (status='live') regions only, matching the
  // network-wide gate (lib/regions/resolveRegionParam.js). Draft regions 404.
  const { data: region } = await sb.from('regions').select('name, state').eq('slug', slug).eq('status', 'live').maybeSingle()
  if (!region) return { title: 'Regional report | Australian Atlas' }
  return {
    title: `${region.name} — Regional Performance Report | Australian Atlas`,
    robots: { index: false, follow: false },
  }
}

export default async function CouncilRegionReport({ params, searchParams }) {
  const { region: slug } = await params
  const sp = await searchParams
  const range = RANGE_DAYS[sp?.range] ? sp.range : '90d'
  const since = new Date(Date.now() - RANGE_DAYS[range] * 86400000).toISOString()

  const sb = getSupabaseAdmin()
  // Public, unauthenticated route: only published (live) regions are exposable.
  // Draft regions fall through to notFound(), matching every other public
  // region surface (search, explore, /regions).
  const { data: region } = await sb
    .from('regions')
    .select('id, slug, name, state, center_lat, center_lng')
    .eq('slug', slug)
    .eq('status', 'live')
    .maybeSingle()

  if (!region) notFound()

  // White-label: if an authenticated council manages this region, brand the
  // report with their name/logo. Public/prospect views stay Atlas-branded.
  let council = null
  try {
    const cookieStore = await cookies()
    const session = validateCouncilSession(cookieStore.get('council_session')?.value)
    if (session?.councilId) {
      const { data: link } = await sb
        .from('council_regions')
        .select('council_id')
        .eq('council_id', session.councilId)
        .eq('region_id', region.id)
        .maybeSingle()
      if (link) {
        const { data: acct } = await sb
          .from('council_accounts')
          .select('name, logo_url')
          .eq('id', session.councilId)
          .maybeSingle()
        if (acct) council = acct
      }
    }
  } catch { /* non-fatal — fall back to Atlas branding */ }

  // Core metrics plus the councillor-ready extras (unique visitors, weekly
  // trend + previous-period deltas, network rank, category coverage). Every
  // extra is best-effort — a failure degrades the report, never blocks it.
  const rangeDays = RANGE_DAYS[range]
  const [metrics, sessions, trendsAll, benchmarksAll, verticalRows] = await Promise.all([
    computeRegionMetrics(sb, region, { since, limit: 10 }),
    computeRegionSessions(sb, region, { since }).catch(() => null),
    computeWeeklyTrends(sb, [region], { rangeDays }).catch(() => null),
    computeBenchmarks(sb, [region], { rangeDays }).catch(() => null),
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
      variant="report"
      rangeLabel={RANGE_LABELS[range]}
      council={council}
      sessions={sessions}
      trends={trends}
      benchmark={benchmark}
      byVertical={byVertical}
    />
  )
}
