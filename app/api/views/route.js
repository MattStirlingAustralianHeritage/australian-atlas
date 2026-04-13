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
  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const userId = await getUserId()
  if (!userId) {
    // Silently skip if not logged in
    return NextResponse.json({ ok: true })
  }

  const sb = getSupabaseAdmin()
  const { error } = await sb.from('user_views').insert({
    user_id: userId,
    listing_id,
  })

  if (error) {
    console.error('Failed to track view:', error.message)
  }

  return NextResponse.json({ ok: true })
}
