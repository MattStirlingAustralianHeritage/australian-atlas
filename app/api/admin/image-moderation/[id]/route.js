import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { updateListing } from '@/lib/admin/updateListing'

/**
 * POST /api/admin/image-moderation/[id] — manual decision on a moderated hero.
 *
 * Body: { action: 'approve' | 'reject' }
 *   approve → image_moderation_status = 'clean'. The now-cleared hero is pushed
 *             to the vertical source DB (the sync gate allows a clean hero).
 *   reject  → the hero is removed (hero_image_url = null, synced) and the row
 *             leaves the moderation queue (status → 'pending', the neutral
 *             no-hero state). A future re-upload is re-moderated from scratch.
 *
 * Auth: admin cookie (checkAdmin), same as the rest of /api/admin/*.
 */
export async function POST(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing listing id' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body?.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: row, error: readErr } = await sb
    .from('listings')
    .select('id, hero_image_url, image_moderation_status')
    .eq('id', id)
    .maybeSingle()

  if (readErr) {
    // Column absent → migration 164 not applied yet.
    if (readErr.code === '42703') {
      return NextResponse.json({ error: 'Image moderation isn’t switched on yet.' }, { status: 503 })
    }
    return NextResponse.json({ error: readErr.message }, { status: 400 })
  }
  if (!row) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  if (action === 'approve') {
    // Mark clean FIRST so updateListing's sync gate (which reads the stored
    // status) will permit pushing the hero to the vertical.
    const { error: updErr } = await sb
      .from('listings')
      .update({
        image_moderation_status: 'clean',
        image_moderation_reason: 'Approved by admin',
        image_moderation_checked_at: now,
        updated_at: now,
      })
      .eq('id', id)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 })
    }

    // Push the now-approved hero to the vertical site (no-op if there's no hero).
    let verticalSync = null
    if (row.hero_image_url) {
      const result = await updateListing(id, { hero_image_url: row.hero_image_url }, { action: 'image-approved' })
      verticalSync = result.verticalSync
    }
    return NextResponse.json({ success: true, status: 'clean', verticalSync })
  }

  // action === 'reject' — remove the rejected image everywhere, drop out of queue.
  const { error: updErr } = await sb
    .from('listings')
    .update({
      image_moderation_status: 'pending',
      image_moderation_category: null,
      image_moderation_reason: 'Rejected by admin',
      image_moderation_confidence: null,
      image_moderation_checked_at: now,
      updated_at: now,
    })
    .eq('id', id)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 })
  }

  // Null the hero in master + sync the removal to the vertical.
  const result = await updateListing(id, { hero_image_url: null }, { action: 'image-rejected' })
  return NextResponse.json({ success: true, status: 'pending', verticalSync: result.verticalSync })
}
