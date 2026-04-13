import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * POST /api/admin/verify
 * Sets a listing as verified (editorial review).
 * Body: { listingId: string }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { listingId } = await request.json()

  if (!listingId) {
    return NextResponse.json({ error: 'listingId required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('listings')
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verification_source: 'editorial_review',
    })
    .eq('id', listingId)
    .select('id, name, verified, verified_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, listing: data })
}
