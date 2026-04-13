import { getSupabaseAdmin } from '@/lib/supabase/clients'
import OutreachActions from './OutreachActions'

export const metadata = { title: 'Outreach Queue — Admin' }
export const dynamic = 'force-dynamic'

const VERTICAL_COLORS = {
  sba: '#6b3a2a', collection: '#5a6b7c', craft: '#7c6b5a',
  fine_grounds: '#5F8A7E', rest: '#8a5a6b', field: '#5a7c5a',
  corner: '#7c5a7c', found: '#5a7c6b', table: '#7c6b5a',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture Atlas', craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds', rest: 'Boutique Stays', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const STATUS_COLORS = {
  not_contacted: '#888',
  contacted: '#3b82f6',
  claimed: '#5F8A7E',
  declined: '#c0392b',
  queued: '#d4a03c',
}

export default async function OutreachPage() {
  const sb = getSupabaseAdmin()

  // Fetch existing outreach listing_ids so we can exclude them
  const { data: outreachRows, error: outreachErr } = await sb
    .from('operator_outreach')
    .select('id, listing_id, contact_email, status, notes, last_contacted_at, created_at, updated_at')
    .order('updated_at', { ascending: false })

  const outreachListingIds = (outreachRows || []).map(r => r.listing_id)

  // Fetch unclaimed, active listings NOT already in outreach, sorted by quality_score
  let query = sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, website, phone, quality_score, address, description')
    .eq('status', 'active')
    .eq('is_claimed', false)
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(500)

  if (outreachListingIds.length > 0) {
    // Supabase doesn't support NOT IN natively, so we filter client-side below
  }

  const { data: readyListings, error: listingsErr } = await query
  const filteredReady = (readyListings || []).filter(l => !outreachListingIds.includes(l.id))

  // Fetch listing data for outreach history rows
  const outreachWithListings = []
  if (outreachRows && outreachRows.length > 0) {
    const listingIds = outreachRows.map(r => r.listing_id).filter(Boolean)
    const { data: historyListings } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state')
      .in('id', listingIds)

    const listingMap = {}
    for (const l of (historyListings || [])) {
      listingMap[l.id] = l
    }

    for (const row of outreachRows) {
      outreachWithListings.push({
        ...row,
        listing: listingMap[row.listing_id] || null,
      })
    }
  }

  // Collect unique verticals and states for filters
  const verticals = [...new Set((filteredReady || []).map(l => l.vertical).filter(Boolean))].sort()
  const states = [...new Set((filteredReady || []).map(l => l.state).filter(Boolean))].sort()

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-muted, #888)', marginBottom: 8,
        }}>
          Operator Outreach
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1.2,
        }}>
          Outreach Queue
        </h1>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
          color: 'var(--color-muted, #888)', marginTop: 8, lineHeight: 1.5,
        }}>
          Contact unclaimed listings to invite operators to claim their profiles.
          {filteredReady.length > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>
              {filteredReady.length} ready to contact
            </span>
          )}
        </p>
      </div>

      {(listingsErr || outreachErr) && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA',
          padding: 16, borderRadius: 8, marginBottom: 24, color: '#991B1B',
          fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
        }}>
          Error loading data: {listingsErr?.message || outreachErr?.message}
        </div>
      )}

      <OutreachActions
        readyListings={filteredReady}
        outreachHistory={outreachWithListings}
        verticals={verticals}
        states={states}
        verticalColors={VERTICAL_COLORS}
        verticalNames={VERTICAL_NAMES}
        statusColors={STATUS_COLORS}
        allStates={STATES}
      />
    </div>
  )
}
