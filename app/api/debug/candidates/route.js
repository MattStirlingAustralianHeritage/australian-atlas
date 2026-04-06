import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Temporary diagnostic — remove after debugging
export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const { data, error, count } = await sb
      .from('listing_candidates')
      .select('name, vertical, status', { count: 'exact' })
      .eq('status', 'pending')
      .limit(5)

    if (error) {
      return NextResponse.json({ error: error.message, code: error.code, details: error.details })
    }

    return NextResponse.json({
      total_pending: count,
      sample: data,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/https?:\/\//, '').slice(0, 12) + '...',
    })
  } catch (err) {
    return NextResponse.json({ exception: err.message })
  }
}
