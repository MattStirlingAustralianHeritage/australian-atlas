import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { fetchGateCheckRows } from '@/lib/gate-check/queue'
import GateCheckClient from './GateCheckClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gate Check — Admin' }

export default async function GateCheckPage() {
  // Auth handled by middleware (all /admin/* routes).
  const sb = getSupabaseAdmin()

  let initialRows = []
  let tableMissing = false
  let loadError = null
  let pendingCount = 0
  let trashCount = 0
  let hiddenCount = 0
  let lastScannedAt = null

  try {
    const res = await fetchGateCheckRows(sb, { status: 'pending' })
    initialRows = res.rows
    tableMissing = res.tableMissing
    // Hidden count is listing-driven (every hidden listing, not just Gate-Check
    // hides) so it stands even when the gate-check table is missing.
    const hRes = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'hidden')
    hiddenCount = hRes.count || 0
    if (!tableMissing) {
      const [pRes, tRes, latest] = await Promise.all([
        sb.from('listing_gate_check').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('listing_gate_check').select('id', { count: 'exact', head: true }).eq('status', 'deleted'),
        sb.from('listing_gate_check').select('scanned_at').order('scanned_at', { ascending: false }).limit(1),
      ])
      pendingCount = pRes.count || 0
      trashCount = tRes.count || 0
      lastScannedAt = latest.data?.[0]?.scanned_at || null
    }
  } catch (err) {
    loadError = err.message || 'Failed to load gate-check queue'
  }

  // Facets derived from the pending set.
  const verticals = [...new Set(initialRows.map(r => r.listing?.vertical).filter(Boolean))].sort()
  const gates = [...new Set(initialRows.flatMap(r => r.failed_gates || []))].sort()

  return (
    <GateCheckClient
      initialRows={initialRows}
      tableMissing={tableMissing}
      loadError={loadError}
      pendingCount={pendingCount}
      trashCount={trashCount}
      hiddenCount={hiddenCount}
      lastScannedAt={lastScannedAt}
      facets={{ verticals, gates }}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
    />
  )
}
