import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { cookies } from 'next/headers'
import { verifySharedToken } from '@/lib/shared-auth'

async function getUserId() {
  const cookieStore = await cookies()
  const token = cookieStore.get('atlas_auth_token')?.value
  if (!token) return null
  try {
    const { valid, user } = await verifySharedToken(token)
    return valid ? user.id : null
  } catch { return null }
}

export async function POST(request) {
  const { listing_id, session_id } = await request.json()

  if (!listing_id) {
    return NextResponse.json({ error: 'listing_id required' }, { status: 400 })
  }
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const userId = await getUserId()
  const sb = getSupabaseAdmin()

  const { error } = await sb.from('serendipity_saves').insert({
    listing_id,
    session_id,
    user_id: userId || null,
    saved_at: new Date().toISOString(),
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  // Get save count for this user or session
  let countQuery = sb
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
