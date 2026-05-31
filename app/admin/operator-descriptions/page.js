import { getSupabaseAdmin } from '@/lib/supabase/clients'
import OperatorDescriptionsQueue from './OperatorDescriptionsQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operator Descriptions — Admin' }

export default async function OperatorDescriptionsPage() {
  // Auth handled by middleware on /admin/* — the API route re-checks for writes.
  const sb = getSupabaseAdmin()

  let drafts = []
  let listingsById = {}

  try {
    const { data, error } = await sb
      .from('operator_description_drafts')
      .select('*')
      .eq('status', 'pending_review')
      .order('submitted_at', { ascending: true })
      .limit(500)
    if (error) {
      console.error('[admin/operator-descriptions] query failed:', error.message)
    } else if (data) {
      drafts = data
    }

    const listingIds = [...new Set(drafts.map(d => d.listing_id).filter(Boolean))]
    if (listingIds.length) {
      const { data: listings } = await sb
        .from('listings')
        .select('id, name, slug, vertical, region, description')
        .in('id', listingIds)
      if (listings) listingsById = Object.fromEntries(listings.map(l => [l.id, l]))
    }
  } catch (err) {
    console.error('[admin/operator-descriptions] error:', err.message)
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Operator Descriptions
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)', maxWidth: 600, margin: '0 auto' }}>
          Each draft was written from operator-submitted facts. Read it against the facts, edit if needed, then approve to publish or send back with a note. Approving writes the venue&rsquo;s live description.
        </p>
      </div>

      <OperatorDescriptionsQueue initialDrafts={drafts} listingsById={listingsById} />
    </div>
  )
}
