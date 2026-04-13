import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/admin/verify/stats
 * Returns network-wide verification progress.
 */
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  // Get total active listings and verified count in parallel
  const [totalResult, verifiedResult] = await Promise.all([
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('verified', true),
  ])

  return NextResponse.json({
    total: totalResult.count || 0,
    verified: verifiedResult.count || 0,
  })
}
