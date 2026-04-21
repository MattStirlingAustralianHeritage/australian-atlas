import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { NextResponse } from 'next/server'

/**
 * POST /api/save-location
 * Persists user location to their profile (logged-in users only).
 * Body: { lat, lng, name }
 */
export async function POST(request) {
  try {
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { lat, lng, name } = await request.json()

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { error } = await sb
      .from('profiles')
      .update({
        saved_latitude: lat,
        saved_longitude: lng,
        saved_location_name: name || null,
      })
      .eq('id', user.id)

    if (error) {
      console.error('[save-location] Update failed:', error.message)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[save-location] Error:', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
