import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { recomputeTotals } from '@/lib/trails/totals'
import { writeRevision } from '@/lib/trails/snapshot'
import { legDistance } from '@/lib/trails/mapbox-distances'

/**
 * POST /api/admin/trails/:id/stops
 *   Body: { listing_id, position?, day_number?, is_overnight?, editorial_copy?, arrival_note? }
 *   Inserts a stop, computes distance/duration from previous stop, recomputes totals.
 */
export async function POST(request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: trail_id } = await params
  const body = await request.json().catch(() => ({}))
  if (!body.listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const { data: listing, error: lErr } = await sb.from('listings')
    .select('id, name, vertical, lat, lng').eq('id', body.listing_id).single()
  if (lErr) return NextResponse.json({ error: `listing not found: ${lErr.message}` }, { status: 400 })

  // Determine position. If body.position is set and a stop already occupies it, shift the rest down.
  const { data: existing } = await sb.from('trail_stops')
    .select('id, position, day_number, listing_id')
    .eq('trail_id', trail_id).order('position', { ascending: true })

  let position = body.position
  if (position == null) position = (existing?.length || 0) + 1
  else {
    const conflict = (existing || []).filter(s => s.position >= position)
    for (const s of conflict) {
      await sb.from('trail_stops').update({ position: s.position + 1 }).eq('id', s.id)
    }
  }

  // Distance from previous stop (if any) — find the stop that will be at position-1.
  const prev = (existing || []).find(s => s.position === position - 1)
  let distance_from_previous_km = null, duration_from_previous_minutes = null
  if (prev) {
    const { data: prevListing } = await sb.from('listings').select('lat, lng').eq('id', prev.listing_id).single()
    const leg = await legDistance(prevListing?.lat, prevListing?.lng, listing.lat, listing.lng)
    if (leg) { distance_from_previous_km = leg.distance_km; duration_from_previous_minutes = leg.duration_minutes }
  }

  const { data: inserted, error: iErr } = await sb.from('trail_stops').insert({
    trail_id,
    listing_id: listing.id,
    vertical: listing.vertical,
    venue_name: listing.name,
    venue_lat: listing.lat,
    venue_lng: listing.lng,
    position,
    day_number: body.day_number ?? 1,
    is_overnight: !!body.is_overnight,
    editorial_copy: body.editorial_copy ?? null,
    arrival_note: body.arrival_note ?? null,
    distance_from_previous_km,
    duration_from_previous_minutes,
  }).select('*').single()
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  await recomputeTotals(sb, trail_id)
  await writeRevision(sb, { trail_id, revised_by: null, notes: `Added stop: ${listing.name}` })

  return NextResponse.json({ stop: inserted }, { status: 201 })
}
