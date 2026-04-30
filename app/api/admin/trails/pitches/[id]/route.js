import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/admin/trails/pitches/:id — full pitch with candidate_results.
 */
export async function GET(_request, { params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('trail_pitches').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ pitch: data })
}
