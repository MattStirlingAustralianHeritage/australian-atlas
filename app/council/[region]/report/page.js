import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { computeRegionMetrics, computeRegionSessions } from '@/lib/analytics/regionMetrics'
import RegionReport from '@/components/council/RegionReport'

export const dynamic = 'force-dynamic'

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
    .select('id, slug, name, state')
    .eq('slug', slug)
    .eq('status', 'live')
    .maybeSingle()

  if (!region) notFound()

  // White-label branding: the public name + logo of the council that manages this
  // region (council_regions → council_accounts). ONLY name + logo_url are read —
  // never tier, billing, or contact (council-private). Falls back to Atlas-only
  // branding when no council manages the region (e.g. the generic example).
  const { data: crRows } = await sb
    .from('council_regions')
    .select('council:council_accounts(name, logo_url)')
    .eq('region_id', region.id)
    .limit(1)
  const council = crRows?.[0]?.council || null

  // Headline numbers come from the same path the dashboard uses (so they match);
  // unique visitors is computed read-only alongside it.
  const [metrics, uniqueVisitors] = await Promise.all([
    computeRegionMetrics(sb, region, { since, limit: 10 }),
    computeRegionSessions(sb, region, { since }),
  ])

  return (
    <RegionReport
      metrics={metrics}
      council={council}
      uniqueVisitors={uniqueVisitors}
      variant="report"
      rangeLabel={RANGE_LABELS[range]}
    />
  )
}
