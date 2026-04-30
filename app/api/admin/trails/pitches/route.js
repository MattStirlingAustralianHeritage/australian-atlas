import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generateCandidates } from '@/lib/trails/generate-candidates'

// Candidate generation is the slow path; bump Vercel's 10s default.
export const maxDuration = 60

/**
 * POST /api/admin/trails/pitches
 *   Create a pitch row and run candidate generation in one shot.
 *   Body: { thesis, region_id, secondary_region_ids?, day_count?,
 *           vertical_weights?, must_include_listing_ids?,
 *           must_start_at_listing_id?, must_end_at_listing_id?,
 *           max_km_per_day?, season_window?, mood_tags?, mood_brief? }
 *   Returns: the inserted pitch row + candidate_results.
 */
export async function POST(request) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (!body?.thesis?.trim()) return NextResponse.json({ error: 'thesis is required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const insertRow = {
    thesis: body.thesis.trim().slice(0, 200),
    region_id: body.region_id ?? null,
    secondary_region_ids: body.secondary_region_ids ?? [],
    day_count: body.day_count ?? null,
    vertical_weights: body.vertical_weights ?? {},
    must_include_listing_ids: body.must_include_listing_ids ?? [],
    must_start_at_listing_id: body.must_start_at_listing_id ?? null,
    must_end_at_listing_id: body.must_end_at_listing_id ?? null,
    max_km_per_day: body.max_km_per_day ?? 200,
    season_window: body.season_window ?? null,
    mood_tags: body.mood_tags ?? [],
    mood_brief: body.mood_brief?.slice(0, 500) ?? null,
  }

  const { data: pitch, error: insErr } = await sb.from('trail_pitches').insert(insertRow).select('*').single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  let candidate_results = null
  let generation_error = null
  try {
    candidate_results = await generateCandidates(sb, pitch)
    await sb.from('trail_pitches').update({ candidate_results }).eq('id', pitch.id)
  } catch (e) {
    generation_error = e.message || String(e)
  }

  return NextResponse.json({
    pitch: { ...pitch, candidate_results },
    generation_error,
  }, { status: 201 })
}

/**
 * GET /api/admin/trails/pitches?status=open|promoted&limit=...
 *   List pitches.
 */
export async function GET(request) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const sb = getSupabaseAdmin()

  let q = sb.from('trail_pitches').select('id, thesis, region_id, day_count, created_at, created_by, promoted_to_trail_id').order('created_at', { ascending: false }).limit(limit)
  if (status === 'open') q = q.is('promoted_to_trail_id', null)
  else if (status === 'promoted') q = q.not('promoted_to_trail_id', 'is', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pitches: data ?? [] })
}
