import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const ALLOWED_FIELDS = [
  'name', 'description', 'website', 'region', 'state', 'address',
  'lat', 'lng', 'phone', 'is_claimed', 'is_featured', 'is_market',
  'editors_pick', 'status', 'hero_image_url', 'vertical',
]

export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  try {
    const body = await request.json()
    const updates = {}

    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate lat/lng if provided
    if ('lat' in updates && updates.lat !== null) {
      updates.lat = parseFloat(updates.lat)
      if (isNaN(updates.lat)) return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 })
    }
    if ('lng' in updates && updates.lng !== null) {
      updates.lng = parseFloat(updates.lng)
      if (isNaN(updates.lng)) return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select('id, vertical, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, created_at, updated_at')
      .single()

    if (error) throw error

    return NextResponse.json({ listing: data })
  } catch (err) {
    console.error('[admin/listings/PATCH] Error:', err.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
