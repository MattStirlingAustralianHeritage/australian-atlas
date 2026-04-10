import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'

export async function POST() {
  try {
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      await supabase.auth.signOut()
    }

    return NextResponse.json({ success: true, redirect: '/operators/login' })
  } catch (err) {
    console.error('[operators/auth/logout] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
