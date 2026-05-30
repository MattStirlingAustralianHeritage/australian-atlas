import { getSupabaseAdmin } from '@/lib/supabase/clients'
import PitchesQueue from './PitchesQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pitch Triage — Admin' }

export default async function PitchesPage() {
  // Auth handled by middleware — no page-level check needed
  const sb = getSupabaseAdmin()

  let pitches = []
  let listingsById = {}
  let slotSummary = {}

  try {
    // Active pitches awaiting triage. select('*') to avoid column-not-found
    // errors if a migration hasn't been applied to production yet.
    const { data, error } = await sb
      .from('pitches')
      .select('*')
      .eq('status', 'active')
      .order('vertical', { ascending: true })
      .order('generated_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('[admin/pitches] Query failed:', error.message)
    } else if (data) {
      pitches = data
    }

    // Source listings for each pitch's anchor — one batched lookup.
    const anchorIds = [...new Set(pitches.map((p) => p.anchor_listing_id).filter(Boolean))]
    if (anchorIds.length) {
      const { data: listings } = await sb
        .from('listings')
        .select('id, name, vertical, region, suburb, state, website, slug, description, sub_type')
        .in('id', anchorIds)
      if (listings) listingsById = Object.fromEntries(listings.map((l) => [l.id, l]))
    }

    // Slot-fill summary (filled vs total per vertical/slot_type) for the header.
    const { data: slots } = await sb
      .from('pitch_slots')
      .select('vertical, slot_type, current_pitch_id')
    if (slots) {
      for (const s of slots) {
        const k = `${s.vertical}/${s.slot_type}`
        slotSummary[k] = slotSummary[k] || { total: 0, filled: 0 }
        slotSummary[k].total++
        if (s.current_pitch_id) slotSummary[k].filled++
      }
    }
  } catch (err) {
    console.error('[admin/pitches] Query error:', err.message)
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Pitch Triage
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Review each generated pitch, then keep it to open in the Editorial queue or dismiss it.
        </p>
      </div>

      <PitchesQueue
        initialPitches={pitches}
        listingsById={listingsById}
        slotSummary={slotSummary}
      />
    </div>
  )
}
