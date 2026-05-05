import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'

async function getAuthed() {
  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(request) {
  const { supabase, user } = await getAuthed()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Single-listing check: ?listing_id=<uuid> returns { saved: boolean }
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')
  if (listingId) {
    const { data } = await supabase
      .from('user_saves')
      .select('listing_id', { head: false })
      .eq('user_id', user.id)
      .eq('listing_id', listingId)
      .maybeSingle()
    return NextResponse.json({ saved: !!data })
  }

  const { data } = await supabase
    .from('user_saves')
    .select(`
      listing_id, saved_at,
      listing:listing_id (id, name, slug, vertical, suburb, state, region, hero_image_url, region_computed:regions!region_computed_id(id,slug,name,state), region_override:regions!region_override_id(id,slug,name,state))
    `)
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false })

  return NextResponse.json({ saves: data || [] })
}

export async function POST(request) {
  const { supabase, user } = await getAuthed()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const { error } = await supabase.from('user_saves').upsert(
    { user_id: user.id, listing_id },
    { onConflict: 'user_id,listing_id' }
  )

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request) {
  const { supabase, user } = await getAuthed()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  await supabase.from('user_saves').delete().eq('user_id', user.id).eq('listing_id', listing_id)

  return NextResponse.json({ success: true })
}
