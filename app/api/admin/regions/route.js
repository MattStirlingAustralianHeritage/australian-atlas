import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/admin/regions — admin-cookie-auth list of all regions for picker UIs.
 *   Lightweight: id, name, slug, state. No API-key gate.
 */
export async function GET() {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('regions').select('id, name, slug, state').order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regions: data ?? [] })
}
