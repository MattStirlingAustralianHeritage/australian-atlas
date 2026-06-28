import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ListingPitchesQueue from './ListingPitchesQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listing Pitches — Admin' }

export default async function ListingPitchesPage() {
  // Auth handled by middleware — no page-level check needed.
  const sb = getSupabaseAdmin()

  let pitches = []
  let listingsById = {}

  try {
    // select('*') so a not-yet-migrated production deploy degrades gracefully
    // rather than 500-ing on a missing column.
    const { data, error } = await sb
      .from('listing_story_pitches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('[admin/listing-pitches] Query failed:', error.message)
    } else if (data) {
      pitches = data
    }

    // Hydrate each pitch's listing for deep links + context — one batched lookup.
    const ids = [...new Set(pitches.map((p) => p.listing_id).filter(Boolean))]
    if (ids.length) {
      const { data: listings } = await sb
        .from('listings')
        .select('id, name, slug, vertical, region, suburb, state, website')
        .in('id', ids)
      if (listings) listingsById = Object.fromEntries(listings.map((l) => [l.id, l]))
    }
  } catch (err) {
    console.error('[admin/listing-pitches] Query error:', err.message)
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Listing Pitches
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Story pitches submitted by operators from their dashboard. Review each, then move it through your editorial process.
        </p>
      </div>

      <ListingPitchesQueue initialPitches={pitches} listingsById={listingsById} />
    </div>
  )
}
