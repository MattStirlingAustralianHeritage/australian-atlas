import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { recomputeTotals } from '@/lib/trails/totals'
import { writeRevision } from '@/lib/trails/snapshot'
import { legDistance } from '@/lib/trails/mapbox-distances'

const STOP_EDITABLE = new Set([
  'position', 'day_number', 'is_overnight', 'editorial_copy', 'arrival_note',
])

/**
 * PATCH /api/admin/trails/:id/stops/:stopId
 *   Update a stop. If `position` changes, neighboring positions are
 *   compacted to keep the sequence dense, and distance/duration legs are
 *   recomputed for the affected stops.
 */
export async function PATCH(request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: trail_id, stopId } = await params
  const sb = getSupabaseAdmin()

  const body = await request.json().catch(() => ({}))
  const patch = {}
  for (const [k, v] of Object.entries(body || {})) if (STOP_EDITABLE.has(k)) patch[k] = v
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'no editable fields' }, { status: 400 })

  // If reordering, normalise positions.
  if ('position' in patch) {
    const { data: stops } = await sb.from('trail_stops').select('id, position').eq('trail_id', trail_id).order('position', { ascending: true })
    const ordered = (stops || []).filter(s => s.id !== stopId)
    const target = Math.max(1, Math.min(patch.position, ordered.length + 1))
    ordered.splice(target - 1, 0, { id: stopId, position: target })
    for (let i = 0; i < ordered.length; i++) {
      const want = i + 1
      if (ordered[i].position !== want || ordered[i].id === stopId) {
        await sb.from('trail_stops').update({ position: want }).eq('id', ordered[i].id)
      }
    }
    delete patch.position
  }

  if (Object.keys(patch).length) {
    const { error } = await sb.from('trail_stops').update(patch).eq('id', stopId).eq('trail_id', trail_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Recompute legs for any stop whose previous-stop changed.
  const { data: allStops } = await sb.from('trail_stops')
    .select('id, position, listing_id, distance_from_previous_km, duration_from_previous_minutes')
    .eq('trail_id', trail_id).order('position', { ascending: true })
  for (let i = 0; i < (allStops || []).length; i++) {
    const cur = allStops[i]
    if (i === 0) {
      if (cur.distance_from_previous_km != null || cur.duration_from_previous_minutes != null) {
        await sb.from('trail_stops').update({ distance_from_previous_km: null, duration_from_previous_minutes: null }).eq('id', cur.id)
      }
      continue
    }
    const prev = allStops[i - 1]
    const { data: ll } = await sb.from('listings').select('lat, lng').in('id', [prev.listing_id, cur.listing_id])
    const prevLL = ll?.find(x => x.id === prev.listing_id) || (await sb.from('listings').select('lat, lng').eq('id', prev.listing_id).single()).data
    const curLL = ll?.find(x => x.id === cur.listing_id) || (await sb.from('listings').select('lat, lng').eq('id', cur.listing_id).single()).data
    const leg = await legDistance(prevLL?.lat, prevLL?.lng, curLL?.lat, curLL?.lng)
    await sb.from('trail_stops').update({
      distance_from_previous_km: leg?.distance_km ?? null,
      duration_from_previous_minutes: leg?.duration_minutes ?? null,
    }).eq('id', cur.id)
  }

  await recomputeTotals(sb, trail_id)
  await writeRevision(sb, { trail_id, revised_by: null, notes: 'Stop updated' })

  const { data: stop } = await sb.from('trail_stops').select('*').eq('id', stopId).single()
  return NextResponse.json({ stop })
}

/**
 * DELETE /api/admin/trails/:id/stops/:stopId
 *   Remove a stop, compact positions, recompute totals + adjacent leg.
 */
export async function DELETE(_request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: trail_id, stopId } = await params
  const sb = getSupabaseAdmin()

  const { error } = await sb.from('trail_stops').delete().eq('id', stopId).eq('trail_id', trail_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Compact positions.
  const { data: remaining } = await sb.from('trail_stops').select('id, position').eq('trail_id', trail_id).order('position', { ascending: true })
  for (let i = 0; i < (remaining || []).length; i++) {
    const want = i + 1
    if (remaining[i].position !== want) {
      await sb.from('trail_stops').update({ position: want }).eq('id', remaining[i].id)
    }
  }

  // Recompute legs.
  const { data: stops } = await sb.from('trail_stops').select('id, position, listing_id').eq('trail_id', trail_id).order('position', { ascending: true })
  for (let i = 0; i < (stops || []).length; i++) {
    if (i === 0) {
      await sb.from('trail_stops').update({ distance_from_previous_km: null, duration_from_previous_minutes: null }).eq('id', stops[i].id)
      continue
    }
    const prev = stops[i - 1], cur = stops[i]
    const { data: prevLL } = await sb.from('listings').select('lat, lng').eq('id', prev.listing_id).single()
    const { data: curLL } = await sb.from('listings').select('lat, lng').eq('id', cur.listing_id).single()
    const leg = await legDistance(prevLL?.lat, prevLL?.lng, curLL?.lat, curLL?.lng)
    await sb.from('trail_stops').update({
      distance_from_previous_km: leg?.distance_km ?? null,
      duration_from_previous_minutes: leg?.duration_minutes ?? null,
    }).eq('id', cur.id)
  }

  await recomputeTotals(sb, trail_id)
  await writeRevision(sb, { trail_id, revised_by: null, notes: 'Stop removed' })

  return NextResponse.json({ ok: true })
}
