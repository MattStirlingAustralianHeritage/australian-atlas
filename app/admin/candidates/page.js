import { getSupabaseAdmin } from '@/lib/supabase/clients'
import CandidateReviewQueue from './CandidateReviewQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listing Candidates — Admin' }

export default async function CandidatesPage() {
  // Auth handled by middleware — no page-level check needed
  const sb = getSupabaseAdmin()

  let candidates = []

  try {
    const { data, error } = await sb
      .from('listing_candidates')
      .select('*')
      .eq('status', 'pending')
      .order('vertical', { ascending: true })
      .order('confidence', { ascending: false })
      .limit(100)

    if (!error && data) candidates = data
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

      <CandidateReviewQueue initialCandidates={candidates} mapboxToken={mapboxToken} />
    </div>
  )
}
