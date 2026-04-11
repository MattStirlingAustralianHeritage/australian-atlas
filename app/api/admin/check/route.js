import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Lightweight auth check — used by inline editing on public pages.
// Returns isAdmin: true if the user is an admin (cookie-based) OR
// a Supabase-authenticated user with inline_edit_access = true.

export async function GET() {
  const cookieStore = await cookies()

  // 1. Check admin cookie (fast path)
  const isAdmin = await checkAdmin(cookieStore)
  if (isAdmin) {
    return NextResponse.json({ isAdmin: true }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  // 2. Check Supabase auth + profile.inline_edit_access
  try {
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const sb = getSupabaseAdmin()
      const { data: profile } = await sb
        .from('profiles')
        .select('role, inline_edit_access')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin' || profile?.inline_edit_access === true) {
        return NextResponse.json({ isAdmin: true }, {
          headers: { 'Cache-Control': 'private, no-store' },
        })
      }
    }
  } catch {}

  return NextResponse.json({ isAdmin: false }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
