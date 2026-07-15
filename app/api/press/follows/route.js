import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validatePressSession, PRESS_SESSION_COOKIE } from '@/lib/press-session'

// Follow / unfollow a region — the beat map that drives every notification.
// POST { regionId } to follow; DELETE { regionId } to unfollow. Regions must
// be live; follows are unique per (member, region).

function getSession(req) {
  const cookie = req.cookies.get(PRESS_SESSION_COOKIE)
  return validatePressSession(cookie?.value)
}

export async function POST(req) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { regionId } = await req.json()
    if (!regionId) return NextResponse.json({ error: 'regionId required' }, { status: 400 })

    const sb = getSupabaseAdmin()

    const { data: region } = await sb
      .from('regions')
      .select('id, name, slug, status')
      .eq('id', regionId)
      .single()
    if (!region || region.status !== 'live') {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 })
    }

    const { error } = await sb.from('press_follows').insert({
      press_id: session.pressId,
      region_id: region.id,
    })
    if (error && error.code !== '23505') throw error // already following = fine

    await sb.from('press_activity').insert({
      press_id: session.pressId,
      action: 'follow_region',
      metadata: { region: region.slug },
    })

    return NextResponse.json({ ok: true, region: { id: region.id, slug: region.slug, name: region.name } })
  } catch (err) {
    console.error('Press follow error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { regionId } = await req.json()
    if (!regionId) return NextResponse.json({ error: 'regionId required' }, { status: 400 })

    const sb = getSupabaseAdmin()
    await sb
      .from('press_follows')
      .delete()
      .eq('press_id', session.pressId)
      .eq('region_id', regionId)

    await sb.from('press_activity').insert({
      press_id: session.pressId,
      action: 'unfollow_region',
      metadata: { region_id: regionId },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Press unfollow error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
