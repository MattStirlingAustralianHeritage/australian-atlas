import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { generateCandidates } from '@/lib/trails/generate-candidates'

export const maxDuration = 60

/**
 * POST /api/admin/trails/pitches/:id/regenerate
 *   Optionally accepts a partial body of fields to update on the pitch
 *   before regenerating (thesis, day_count, vertical_weights, ...).
 *   Then re-runs candidate generation against the updated pitch row.
 */
export async function POST(request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sb = getSupabaseAdmin()

  const body = await request.json().catch(() => ({}))
  const ALLOWED = new Set([
    'thesis', 'region_id', 'secondary_region_ids', 'day_count',
    'vertical_weights', 'must_include_listing_ids',
    'must_start_at_listing_id', 'must_end_at_listing_id',
    'max_km_per_day', 'season_window', 'mood_tags', 'mood_brief',
  ])
  const patch = {}
  for (const [k, v] of Object.entries(body || {})) if (ALLOWED.has(k)) patch[k] = v
  if (Object.keys(patch).length) {
    const { error } = await sb.from('trail_pitches').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { data: pitch, error: getErr } = await sb.from('trail_pitches').select('*').eq('id', id).single()
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 404 })

  let candidate_results = null, generation_error = null
  try {
    candidate_results = await generateCandidates(sb, pitch)
    await sb.from('trail_pitches').update({ candidate_results }).eq('id', id)
  } catch (e) {
    generation_error = e.message || String(e)
  }

  return NextResponse.json({ pitch: { ...pitch, candidate_results }, generation_error })
}
