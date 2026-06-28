import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * Admin queue for operator-submitted story pitches (/admin/listing-pitches).
 *
 * GET    — list all pitches, newest first.
 * PATCH  — update a pitch's status and/or admin_notes. Body: { id, status?, admin_notes? }
 */

const STATUSES = ['new', 'reviewing', 'accepted', 'declined', 'published']

export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('listing_story_pitches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[admin/listing-pitches GET] Query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ pitches: data || [] })
}

export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { id, status, admin_notes } = body || {}
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const patch = {}
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    patch.status = status
  }
  if (admin_notes !== undefined) {
    patch.admin_notes = (admin_notes || '').slice(0, 2000)
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('listing_story_pitches')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[admin/listing-pitches PATCH] Update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ pitch: data })
}
