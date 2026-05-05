import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'

export async function POST(request) {
  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Silently skip if not logged in
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from('user_views').insert({
    user_id: user.id,
    listing_id,
  })

  if (error) {
    console.error('Failed to track view:', error.message)
  }

  return NextResponse.json({ ok: true })
}
