import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { recomputeTotals } from '@/lib/trails/totals'
import { writeRevision } from '@/lib/trails/snapshot'

const EDITABLE_FIELDS = new Set([
  'slug', 'title', 'subtitle', 'intro', 'outro',
  'hero_image_url', 'hero_image_alt', 'hero_image_credit',
  'region_id', 'secondary_region_ids', 'season_window',
  'mood_tags', 'day_count', 'thesis',
  'og_title', 'og_description', 'meta_description',
  'visibility',
])

/**
 * GET /api/admin/trails/:id — full trail with stops + most-recent revision.
 */
export async function GET(_request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: trail, error: tErr } = await sb.from('trails').select('*').eq('id', id).single()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 404 })

  const { data: stops } = await sb.from('trail_stops')
    .select('*, listings!trail_stops_listing_id_fkey(id, name, slug, vertical, sub_type, region, suburb, state, lat, lng, hero_image_url, description, website)')
    .eq('trail_id', id).order('position', { ascending: true })

  const { data: latestRev } = await sb.from('trail_revisions')
    .select('id, revised_by, revised_at, notes')
    .eq('trail_id', id).order('revised_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({ trail, stops: stops || [], latest_revision: latestRev || null })
}

/**
 * PATCH /api/admin/trails/:id — update any editable field (NOT status — that's
 * handled by /transitions). Snapshots a revision after the update.
 */
export async function PATCH(request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sb = getSupabaseAdmin()

  const body = await request.json().catch(() => ({}))
  const patch = {}
  for (const [k, v] of Object.entries(body || {})) if (EDITABLE_FIELDS.has(k)) patch[k] = v
  if ('status' in body) {
    return NextResponse.json({ error: 'status changes go through POST /transitions' }, { status: 400 })
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'no editable fields in request' }, { status: 400 })

  patch.last_edited_at = new Date().toISOString()

  const { data, error } = await sb.from('trails').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await writeRevision(sb, { trail_id: id, revised_by: null, notes: body._note ?? null })

  return NextResponse.json({ trail: data })
}
