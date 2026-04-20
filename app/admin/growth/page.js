import { getSupabaseAdmin } from '@/lib/supabase/clients'
import GrowthDashboard from './GrowthDashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Growth Engine — Admin' }

const STAGES = ['discover', 'verify', 'curate', 'prepare', 'queue']
const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

export default async function GrowthPage() {
  const sb = getSupabaseAdmin()

  // Check if pipeline_stage column exists by testing a query
  let hasPipelineStage = true
  {
    const { error } = await sb
      .from('listing_candidates')
      .select('pipeline_stage')
      .limit(1)
    if (error) hasPipelineStage = false
  }

  // Pipeline stage counts
  const stageCounts = {}
  if (hasPipelineStage) {
    for (const stage of STAGES) {
      const { count } = await sb
        .from('listing_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('pipeline_stage', stage)
        .in('status', ['pending', 'reviewing'])
      stageCounts[stage] = count || 0
    }
  } else {
    const { count: pendingCount } = await sb
      .from('listing_candidates')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'reviewing'])
    for (const stage of STAGES) stageCounts[stage] = 0
    stageCounts.queue = pendingCount || 0
  }

  // Per-vertical queue depth
  const verticalCounts = {}
  for (const v of ALL_VERTICALS) {
    const { count } = await sb
      .from('listing_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('vertical', v)
      .in('status', ['pending', 'reviewing'])
    verticalCounts[v] = count || 0
  }

  // Recent conversions (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const { count: recentConversions } = await sb
    .from('listing_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'converted')
    .gte('reviewed_at', thirtyDaysAgo)

  // Recent rejections (last 30 days)
  const { count: recentRejections } = await sb
    .from('listing_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .gte('reviewed_at', thirtyDaysAgo)

  // Disqualified candidates count
  const { count: disqualifiedCount } = await sb
    .from('candidates_disqualified')
    .select('id', { count: 'exact', head: true })

  // Wrong vertical count
  const { count: wrongVerticalCount } = await sb
    .from('candidates_wrong_vertical')
    .select('id', { count: 'exact', head: true })

  // Total active listings
  const { count: totalListings } = await sb
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  // Candidates in queue stage (for the review list)
  const { data: queueCandidates } = await sb
    .from('listing_candidates')
    .select('*')
    .eq('status', 'pending')
    .eq('pipeline_stage', 'queue')
    .order('priority', { ascending: false })
    .order('confidence', { ascending: false })
    .limit(50)

  // All pending candidates for the pipeline view
  const candidateSelect = hasPipelineStage
    ? 'id, name, website_url, region, vertical, confidence, source, pipeline_stage, priority, status, gate_results, created_at, state, sub_type'
    : 'id, name, website_url, region, vertical, confidence, source, status, gate_results, created_at'

  let candidateQuery = sb
    .from('listing_candidates')
    .select(candidateSelect)
    .in('status', ['pending', 'reviewing'])

  if (hasPipelineStage) {
    candidateQuery = candidateQuery
      .order('pipeline_stage', { ascending: true })
      .order('priority', { ascending: false })
  }

  const { data: allCandidates } = await candidateQuery
    .order('confidence', { ascending: false })
    .limit(500)

  // If no pipeline_stage column, assign all to 'queue'
  const mappedCandidates = (allCandidates || []).map(c => ({
    ...c,
    pipeline_stage: c.pipeline_stage || 'queue',
    priority: c.priority || 0,
  }))

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink)', marginBottom: 4,
        }}>
          Growth Engine
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          5-stage venue discovery pipeline. {totalListings?.toLocaleString() || 0} active listings across the network.
        </p>
      </div>

      <GrowthDashboard
        stageCounts={stageCounts}
        verticalCounts={verticalCounts}
        candidates={mappedCandidates}
        queueCandidates={queueCandidates || []}
        stats={{
          totalListings: totalListings || 0,
          recentConversions: recentConversions || 0,
          recentRejections: recentRejections || 0,
          disqualifiedCount: disqualifiedCount || 0,
          wrongVerticalCount: wrongVerticalCount || 0,
        }}
      />
    </div>
  )
}
