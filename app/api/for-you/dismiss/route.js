import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'

export async function POST(request) {
  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await request.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const { error } = await supabase.from('user_dismissals').upsert(
    { user_id: user.id, listing_id },
    { onConflict: 'user_id,listing_id' }
  )

  if (error) return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
