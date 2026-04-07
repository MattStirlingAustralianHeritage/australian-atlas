import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/** Lightweight humanisation stats for the admin nav bar */
export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const [humanisedRes, totalRes] = await Promise.all([
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('humanised', true),
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ])
    return NextResponse.json({
      humanised_count: humanisedRes.count || 0,
      total_active_count: totalRes.count || 0,
    })
  } catch {
    return NextResponse.json({ humanised_count: 0, total_active_count: 0 })
  }
}
