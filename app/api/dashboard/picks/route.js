import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'

const PICKS_CONFIG = [
  {
    vertical: 'sba',
    picksTable: 'producer_picks',
    junctionTable: 'producer_pick_venues',
    curatorFk: 'curator_venue_id',
    pickedFk: 'venue_id',
    venueTable: 'venues',
    label: 'Small Batch',
  },
  {
    vertical: 'rest',
    picksTable: 'host_picks',
    junctionTable: 'host_pick_properties',
    curatorFk: 'curator_property_id',
    pickedFk: 'property_id',
    venueTable: 'properties',
    label: 'Rest',
  },
  {
    vertical: 'fine_grounds',
    picksTable: 'roaster_picks',
    junctionTable: 'roaster_pick_entities',
    curatorFk: 'curator_entity_id',
    pickedFk: 'entity_id',
    venueTable: 'roasters',
    label: 'Fine Grounds',
  },
]

export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()

  const { data: userListings } = await admin
    .from('listings')
    .select('id, name, slug, vertical, source_id, region')
    .eq('is_claimed', true)

  if (!userListings?.length) return NextResponse.json({ outgoing: [], incoming: [] })

  const outgoing = []
  const incoming = []

  for (const cfg of PICKS_CONFIG) {
    const myListings = userListings.filter(l => l.vertical === cfg.vertical)
    if (!myListings.length) continue

    try {
      const vClient = getVerticalClient(cfg.vertical)
      const sourceIds = myListings.map(l => l.source_id)

      const { data: outPicks } = await vClient
        .from(cfg.picksTable)
        .select(`id, slug, framing_line, published_at, ${cfg.curatorFk}`)
        .in(cfg.curatorFk, sourceIds)
        .eq('status', 'published')

      for (const pick of (outPicks || [])) {
        const myListing = myListings.find(l => String(l.source_id) === String(pick[cfg.curatorFk]))
        if (!myListing) continue

        const { data: pickedVenues } = await vClient
          .from(cfg.junctionTable)
          .select(`position, curator_note, ${cfg.pickedFk}`)
          .eq('pick_id', pick.id)
          .order('position')

        for (const pv of (pickedVenues || [])) {
          const { data: venue } = await vClient
            .from(cfg.venueTable)
            .select('name, slug')
            .eq('id', pv[cfg.pickedFk])
            .single()

          outgoing.push({
            vertical: cfg.vertical,
            verticalLabel: cfg.label,
            curatorVenueName: myListing.name,
            pickedVenueName: venue?.name || 'Unknown',
            pickedVenueSlug: venue?.slug,
            note: pv.curator_note,
            position: pv.position,
            pickSlug: pick.slug,
          })
        }
      }

      const { data: inPicks } = await vClient
        .from(cfg.junctionTable)
        .select(`pick_id, curator_note, position, ${cfg.pickedFk}`)
        .in(cfg.pickedFk, sourceIds)

      for (const pv of (inPicks || [])) {
        const myListing = myListings.find(l => String(l.source_id) === String(pv[cfg.pickedFk]))
        if (!myListing) continue

        const { data: pick } = await vClient
          .from(cfg.picksTable)
          .select(`id, slug, framing_line, ${cfg.curatorFk}`)
          .eq('id', pv.pick_id)
          .eq('status', 'published')
          .single()

        if (!pick) continue

        const { data: curatorVenue } = await vClient
          .from(cfg.venueTable)
          .select('name, slug')
          .eq('id', pick[cfg.curatorFk])
          .single()

        incoming.push({
          vertical: cfg.vertical,
          verticalLabel: cfg.label,
          curatorVenueName: curatorVenue?.name || 'Unknown',
          curatorVenueSlug: curatorVenue?.slug,
          pickedVenueName: myListing.name,
          note: pv.curator_note,
          framingLine: pick.framing_line,
          pickSlug: pick.slug,
        })
      }
    } catch {
      // Vertical DB may be unreachable or picks table may not exist
    }
  }

  return NextResponse.json({ outgoing, incoming })
}
