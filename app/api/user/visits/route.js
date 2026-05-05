import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'

/**
 * POST /api/user/visits — Mark a listing as visited
 * DELETE /api/user/visits — Remove a visit
 * GET /api/user/visits — Get all user visits
 */

async function getAuthed() {
  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET() {
  const { supabase, user } = await getAuthed()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_visits')
    .select(`
      listing_id, visited_at,
      listing:listing_id (id, name, slug, vertical, suburb, state, region, hero_image_url, region_computed:regions!region_computed_id(id,slug,name,state), region_override:regions!region_override_id(id,slug,name,state))
    `)
    .eq('user_id', user.id)
    .order('visited_at', { ascending: false })

  return NextResponse.json({ visits: data || [] })
}

export async function POST(request) {
  const { supabase, user } = await getAuthed()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const { error } = await supabase.from('user_visits').upsert(
    { user_id: user.id, listing_id },
    { onConflict: 'user_id,listing_id' }
  )

  if (error) return NextResponse.json({ error: 'Failed to save visit' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request) {
  const { supabase, user } = await getAuthed()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  await supabase.from('user_visits').delete().eq('user_id', user.id).eq('listing_id', listing_id)

  return NextResponse.json({ success: true })
}
