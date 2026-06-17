import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { computeRegionMetrics } from '@/lib/analytics/regionMetrics'
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

  const metrics = await computeRegionMetrics(sb, region, { since, limit: 10 })

  return <RegionReport metrics={metrics} variant="report" rangeLabel={RANGE_LABELS[range]} />
}
