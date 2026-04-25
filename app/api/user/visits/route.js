import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { cookies } from 'next/headers'
import { verifySharedToken } from '@/lib/shared-auth'

/**
 * POST /api/user/visits — Mark a listing as visited
 * DELETE /api/user/visits — Remove a visit
 * GET /api/user/visits — Get all user visits
 */

async function getUserId() {
  const cookieStore = await cookies()
  const token = cookieStore.get('atlas_auth_token')?.value
  if (!token) return null
  try {
    const { valid, user } = await verifySharedToken(token)
    return valid ? user.id : null
  } catch { return null }
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('user_visits')
    .select(`
      listing_id, visited_at,
      listing:listing_id (id, name, slug, vertical, suburb, state, region, hero_image_url, region_computed:regions!region_computed_id(id,slug,name,state), region_override:regions!region_override_id(id,slug,name,state))
    `)
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })

  return NextResponse.json({ visits: data || [] })
}

export async function POST(request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { error } = await sb.from('user_visits').upsert(
    { user_id: userId, listing_id },
    { onConflict: 'user_id,listing_id' }
  )

  if (error) return NextResponse.json({ error: 'Failed to save visit' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  await sb.from('user_visits').delete().eq('user_id', userId).eq('listing_id', listing_id)

  return NextResponse.json({ success: true })
}
