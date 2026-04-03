import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // Get the user's claimed venues from master listings
  const { data: userListings } = await admin
    .from('listings')
    .select('id, name, slug, vertical, source_id, region')
    .eq('is_claimed', true)

  // Query picks tables across verticals that support them
  const picksConfig = [
    { metaTable: 'sba_meta', picksTable: 'producer_picks', vertical: 'sba' },
    { metaTable: 'fine_grounds_meta', picksTable: 'roaster_picks', vertical: 'fine_grounds' },
    { metaTable: 'rest_meta', picksTable: 'host_picks', vertical: 'rest' },
  ]

  const outgoing = []
  const incoming = []

  for (const config of picksConfig) {
    try {
      // Check for picks made by the user's venues (outgoing)
      const { data: outPicks } = await admin
        .from(config.picksTable)
        .select('*')
        .limit(50)

      if (outPicks) {
        for (const pick of outPicks) {
          // Check if this pick was made by one of the user's venues
          const userVenue = userListings?.find(
            (l) => l.vertical === config.vertical && String(l.source_id) === String(pick.venue_id)
          )
          if (userVenue) {
            outgoing.push({ ...pick, vertical: config.vertical, venueName: userVenue.name })
          }

          // Check if this pick references one of the user's venues (incoming)
          const targetVenue = userListings?.find(
            (l) => String(l.source_id) === String(pick.picked_venue_id)
          )
          if (targetVenue) {
            incoming.push({ ...pick, vertical: config.vertical, venueName: targetVenue.name })
          }
        }
      }
    } catch {
      // Picks table may not exist yet for this vertical
    }
  }

  return NextResponse.json({ outgoing, incoming })
}
