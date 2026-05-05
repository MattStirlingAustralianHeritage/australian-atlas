import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'

/**
 * POST /api/discover/merge-session
 *
 * Body: { session_id: string }
 *
 * Claims anonymous serendipity_saves rows for the now-authenticated user,
 * then mirrors them into user_saves so saves from Discover live alongside
 * saves from the listing detail page. Idempotent — re-calling with the
 * same session_id is safe.
 */
export async function POST(request) {
  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { session_id } = await request.json().catch(() => ({}))
  if (!session_id || typeof session_id !== 'string') {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  // Claim anonymous saves for this session
  const { data: claimed, error: claimErr } = await supabase
    .from('serendipity_saves')
    .update({ user_id: user.id })
    .eq('session_id', session_id)
    .is('user_id', null)
    .select('listing_id')

  if (claimErr) {
    return NextResponse.json({ error: 'Failed to merge session' }, { status: 500 })
  }

  const merged = claimed?.length || 0

  // Mirror the claimed listings into user_saves so they appear in
  // /account/saved alongside detail-page saves. Conflicts are ignored
  // (the user may already have saved the listing via another path).
  if (merged > 0) {
    const rows = claimed.map(r => ({ user_id: user.id, listing_id: r.listing_id }))
    await supabase
      .from('user_saves')
      .upsert(rows, { onConflict: 'user_id,listing_id', ignoreDuplicates: true })
  }

  return NextResponse.json({ merged })
}
