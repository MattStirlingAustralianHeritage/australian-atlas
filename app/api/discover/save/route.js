import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'

export async function POST(request) {
  const { listing_id, session_id } = await request.json()

  if (!listing_id) {
    return NextResponse.json({ error: 'listing_id required' }, { status: 400 })
  }
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id || null

  const { error } = await supabase.from('serendipity_saves').insert({
    listing_id,
    session_id,
    user_id: userId,
    saved_at: new Date().toISOString(),
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  // Get save count for this user or session
  let countQuery = supabase
    .from('serendipity_saves')
    .select('*', { count: 'exact', head: true })

  if (userId) {
    countQuery = countQuery.eq('user_id', userId)
  } else {
    countQuery = countQuery.eq('session_id', session_id)
  }

  const { count } = await countQuery

  return NextResponse.json({ success: true, save_count: count || 1 }, { status: 201 })
}
