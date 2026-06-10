import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { tripTitle } from '@/lib/plan-a-stay/share-util'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay v2 — a user's saved trips
   ═══════════════════════════════════════════════════════════════════════
   GET    → the signed-in user's saved trips (newest first), lean shape.
   DELETE → detach a trip from the account (keeps the public share alive).

   Reads use the service-role client filtered by user_id: RLS only grants
   anon SELECT on public rows, so an authed client would see nothing.    */

function countStops(days) {
  if (!Array.isArray(days)) return 0
  return days.reduce((sum, d) => sum + ((d.stops || d.listings || []).length), 0)
}

export async function GET() {
  try {
    const auth = await createAuthServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('plan_a_stay_trips')
      .select('share_slug, trip, stays_only, answers, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[plan-a-stay/saved] Fetch failed:', error.message)
      return NextResponse.json({ error: 'Failed to load saved trips' }, { status: 500 })
    }

    const trips = (data || []).map(row => {
      const days = row.trip?.days || []
      return {
        slug: row.share_slug,
        title: tripTitle(row.answers, row.trip),
        region: row.answers?.region || null,
        day_count: days.length,
        stop_count: countStops(days),
        is_stays_only: !!row.stays_only,
        created_at: row.created_at,
      }
    })

    return NextResponse.json({ trips })
  } catch (err) {
    console.error('[plan-a-stay/saved] GET', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const auth = await createAuthServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const { slug } = await request.json().catch(() => ({}))
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    // Detach from the account only — scoped to this user's own rows so a
    // slug can never be removed from someone else's account.
    const { error } = await sb
      .from('plan_a_stay_trips')
      .update({ user_id: null })
      .eq('share_slug', slug)
      .eq('user_id', user.id)

    if (error) {
      console.error('[plan-a-stay/saved] Delete failed:', error.message)
      return NextResponse.json({ error: 'Failed to remove trip' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[plan-a-stay/saved] DELETE', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
