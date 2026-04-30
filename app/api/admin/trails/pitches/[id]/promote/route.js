import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { recomputeTotals } from '@/lib/trails/totals'
import { writeRevision } from '@/lib/trails/snapshot'

/**
 * POST /api/admin/trails/pitches/:id/promote
 *   Body (optional): { title?, slug? }
 *   Creates a trails row (status='draft') from the pitch's candidate_results,
 *   inserts trail_stops in suggested_position order with day_number,
 *   distances, etc., copies thesis through to the trail, sets author_id.
 *   IMPORTANT: no AI prose is copied — title/slug are placeholders the
 *   editor will fill in the draft view.
 */
export async function POST(request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: pitch, error: pErr } = await sb.from('trail_pitches').select('*').eq('id', id).single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 })
  if (pitch.promoted_to_trail_id) {
    return NextResponse.json({ error: 'pitch already promoted', trail_id: pitch.promoted_to_trail_id }, { status: 409 })
  }

  const stops = pitch.candidate_results?.stops || []
  if (!stops.length) {
    return NextResponse.json({ error: 'pitch has no candidate stops to promote' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const placeholderSlug = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  // Build trail row. Editorial copy stays empty — the writing happens
  // in the draft view by a human, never an AI.
  const trailRow = {
    slug: body.slug || placeholderSlug,
    title: body.title || 'Untitled draft trail',
    type: 'editorial',
    visibility: 'private',
    status: 'draft',
    thesis: pitch.thesis,
    region_id: pitch.region_id,
    secondary_region_ids: pitch.secondary_region_ids || [],
    season_window: pitch.season_window,
    mood_tags: pitch.mood_tags || [],
    day_count: pitch.day_count,
    last_edited_at: new Date().toISOString(),
  }

  const { data: trail, error: tErr } = await sb.from('trails').insert(trailRow).select('*').single()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  // Copy stops into trail_stops. listing_id, position, day_number,
  // distances, is_overnight come from the pitch; editorial_copy is
  // intentionally NULL — editor writes it.
  const stopRows = stops.map((s, i) => ({
    trail_id: trail.id,
    listing_id: s.listing_id,
    vertical: s.listing?.vertical || 'unknown',  // existing not-null column
    venue_name: s.listing?.name || 'Unknown',    // existing not-null column
    venue_lat: s.listing?.lat ?? null,
    venue_lng: s.listing?.lng ?? null,
    position: s.suggested_position ?? (i + 1),
    day_number: s.suggested_day ?? 1,
    is_overnight: !!s.is_overnight,
    distance_from_previous_km: s.distance_from_previous_km ?? null,
    duration_from_previous_minutes: s.duration_from_previous_minutes ?? null,
    editorial_copy: null,
    arrival_note: null,
  }))
  if (stopRows.length) {
    const { error: sErr } = await sb.from('trail_stops').insert(stopRows)
    if (sErr) {
      await sb.from('trails').delete().eq('id', trail.id)
      return NextResponse.json({ error: `stops insert failed: ${sErr.message}` }, { status: 500 })
    }
  }

  await recomputeTotals(sb, trail.id)
  await sb.from('trail_pitches').update({ promoted_to_trail_id: trail.id }).eq('id', id)

  // Initial revision snapshot.
  await writeRevision(sb, { trail_id: trail.id, revised_by: null, notes: 'Initial promotion from pitch' })

  return NextResponse.json({ trail_id: trail.id, slug: trail.slug, stop_count: stopRows.length }, { status: 201 })
}
