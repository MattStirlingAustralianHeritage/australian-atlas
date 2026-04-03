import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET(request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await sb
      .from('events')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('status', 'approved')
      .lt('end_date', today)
      .select('id')

    if (error) throw error

    const count = data?.length || 0
    console.log(`[cron/archive-events] Archived ${count} event(s)`)

    return NextResponse.json({ success: true, archived: count })
  } catch (err) {
    console.error('[cron/archive-events] Error:', err.message)
    return NextResponse.json({ error: 'Archive failed' }, { status: 500 })
  }
}
