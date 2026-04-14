import { getSupabaseAdmin } from '@/lib/supabase/clients'
import CandidateReviewQueue from './CandidateReviewQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listing Candidates — Admin' }

const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

export default async function CandidatesPage() {
  // Auth handled by middleware — no page-level check needed
  const sb = getSupabaseAdmin()

  let candidates = []
  let rejectedCandidates = []
  let queueDepth = {}

  try {
    // Fetch pending candidates — always use select('*') to avoid column-not-found
    // errors when migrations haven't been applied to production yet
    const { data, error } = await sb
      .from('listing_candidates')
      .select('*')
      .eq('status', 'pending')
      .order('vertical', { ascending: true })
      .order('confidence', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[admin/candidates] Query failed:', error.message)
    } else if (data) {
      candidates = data
    }

    // Fetch per-vertical queue depth
    const depthPromises = ALL_VERTICALS.map(async (v) => {
      const { count } = await sb
        .from('listing_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('vertical', v)
      return [v, count || 0]
    })
    const depths = await Promise.all(depthPromises)
    queueDepth = Object.fromEntries(depths)

    // Fetch recently rejected/skipped candidates (last 50)
    const { data: rejected } = await sb
      .from('listing_candidates')
      .select('*')
      .eq('status', 'rejected')
      .order('reviewed_at', { ascending: false })
      .limit(50)

    if (rejected) rejectedCandidates = rejected
  } catch (err) {
    console.error('[admin/candidates] Query error:', err.message)
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Candidate Review
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Preview each listing, edit inline, then publish to the network or skip.
        </p>
      </div>

      <CandidateReviewQueue
        initialCandidates={candidates}
        initialRejected={rejectedCandidates}
        queueDepth={queueDepth}
        mapboxToken={mapboxToken}
      />
    </div>
  )
}
