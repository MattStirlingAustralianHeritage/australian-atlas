import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { fetchQueueRows } from '@/lib/gate/queue'
import GateReviewClient from './GateReviewClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gate Review — Admin' }

export default async function GateReviewPage() {
  // Auth handled by middleware (all /admin/* routes).
  const sb = getSupabaseAdmin()

  let initialRows = []
  let tableMissing = false
  let loadError = null
  let pendingCount = 0
  let trashCount = 0

  try {
    const res = await fetchQueueRows(sb, { status: 'pending' })
    initialRows = res.rows
    tableMissing = res.tableMissing
    if (!tableMissing) {
      const [pRes, tRes] = await Promise.all([
        sb.from('listing_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('listing_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'deleted'),
      ])
      pendingCount = pRes.count || 0
      trashCount = tRes.count || 0
    }
  } catch (err) {
    loadError = err.message || 'Failed to load queue'
  }

  // Filter dropdown options, derived from the initial pending set.
  const verticals = [...new Set(initialRows.map(r => r.listing?.vertical).filter(Boolean))].sort()
  const gates = [...new Set(initialRows.map(r => r.gate_flagged).filter(Boolean))].sort()
  const sources = [...new Set(initialRows.map(r => r.flag_source).filter(Boolean))].sort()

  return (
    <GateReviewClient
      initialRows={initialRows}
      tableMissing={tableMissing}
      loadError={loadError}
      pendingCount={pendingCount}
      trashCount={trashCount}
      facets={{ verticals, gates, sources }}
    />
  )
}
