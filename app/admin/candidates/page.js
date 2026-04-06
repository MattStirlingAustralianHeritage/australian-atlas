import { getSupabaseAdmin } from '@/lib/supabase/clients'
import CandidateReviewQueue from './CandidateReviewQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listing Candidates — Admin' }

export default async function CandidatesPage() {
  // Auth handled by middleware — no page-level check needed
  const sb = getSupabaseAdmin()

  let candidates = []
  let debugInfo = null

  try {
    const { data, error, count } = await sb
      .from('listing_candidates')
      .select('*', { count: 'exact' })
      .eq('status', 'pending')
      .order('vertical', { ascending: true })
      .order('confidence', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[admin/candidates] Supabase error:', error)
      debugInfo = `Query error: ${error.message}`
    } else {
      candidates = data || []
      debugInfo = `Found ${candidates.length} candidates (total: ${count})`
    }
  } catch (err) {
    console.error('[admin/candidates] Query error:', err.message)
    debugInfo = `Exception: ${err.message}`
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Candidate Review
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Review and curate venues for the Atlas Network. Approve to create a draft listing, reject to dismiss.
        </p>
      </div>

      {debugInfo && (
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#999', textAlign: 'center', marginBottom: 16 }}>
          {debugInfo}
        </p>
      )}

      <CandidateReviewQueue initialCandidates={candidates} />
    </div>
  )
}
