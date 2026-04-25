import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import DuplicatesTable from './DuplicatesTable'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Duplicate Pairs | Admin | Australian Atlas',
}

export default async function DuplicatesPage() {
  const sb = getSupabaseAdmin()

  // ── Fetch counts by status ──────────────────────────────
  const [
    { count: pendingCount },
    { count: mergedCount },
    { count: dismissedCount },
  ] = await Promise.all([
    sb.from('duplicate_pairs').select('id', { count: 'exact', head: true }).or('status.eq.pending,status.is.null'),
    sb.from('duplicate_pairs').select('id', { count: 'exact', head: true }).eq('status', 'merged'),
    sb.from('duplicate_pairs').select('id', { count: 'exact', head: true }).eq('status', 'dismissed'),
  ])

  // ── Fetch pending pairs ─────────────────────────────────
  const { data: pairs, error: pairsError } = await sb
    .from('duplicate_pairs')
    .select('id, listing_a_id, listing_b_id, confidence, match_reason, status')
    .or('status.eq.pending,status.is.null')
    .limit(300)

  if (pairsError) {
    console.error('[admin/duplicates] Pairs query error:', pairsError.message)
  }

  // Sort: high confidence first, then by match_reason
  const sorted = (pairs || []).sort((a, b) => {
    const confOrder = { high: 0, medium: 1 }
    const ca = confOrder[a.confidence] ?? 2
    const cb = confOrder[b.confidence] ?? 2
    if (ca !== cb) return ca - cb
    return (a.match_reason || '').localeCompare(b.match_reason || '')
  })

  // ── Fetch listing details for all referenced IDs ────────
  const listingIds = new Set()
  for (const p of sorted) {
    listingIds.add(p.listing_a_id)
    listingIds.add(p.listing_b_id)
  }

  const listingsMap = {}
  if (listingIds.size > 0) {
    const { data: listings, error: listingsError } = await sb
      .from('listings')
      .select(`id, name, slug, vertical, region, state, website, address, quality_score, status, ${LISTING_REGION_SELECT}`)
      .in('id', [...listingIds])

    if (listingsError) {
      console.error('[admin/duplicates] Listings query error:', listingsError.message)
    }

    for (const l of (listings || [])) {
      listingsMap[l.id] = l
    }
  }

  // ── Enrich pairs with listing data ──────────────────────
  const enrichedPairs = sorted.map(p => ({
    ...p,
    listing_a: listingsMap[p.listing_a_id] || null,
    listing_b: listingsMap[p.listing_b_id] || null,
  }))

  const counts = {
    pending: pendingCount || 0,
    merged: mergedCount || 0,
    dismissed: dismissedCount || 0,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream, #F5F1EB)', fontFamily: 'var(--font-body, system-ui)' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0' }}>
            Duplicate Pairs
          </h1>
        </div>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-muted, #8B8578)' }}>
          {counts.pending} pending review
        </span>
      </div>

      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Table — counts are managed client-side for instant updates */}
        <DuplicatesTable initialPairs={enrichedPairs} initialCounts={counts} />
      </div>
    </div>
  )
}

function SummaryCard({ label, sublabel, count, color, bg, border }) {
  return (
    <div style={{
      display: 'block',
      background: bg,
      borderRadius: '12px',
      border: `1px solid ${border}`,
      padding: '1.25rem',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', margin: '0 0 0.375rem' }}>
        {label}
      </p>
      <p style={{ fontSize: '2rem', fontWeight: 600, color, margin: '0 0 0.25rem', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display, Georgia)' }}>
        {count}
      </p>
      <p style={{ fontSize: '0.7rem', color: 'var(--color-muted, #8B8578)', margin: 0 }}>
        {sublabel}
      </p>
    </div>
  )
}
