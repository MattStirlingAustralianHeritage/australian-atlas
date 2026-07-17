import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { loadTradeAutopilotSettings, saveTradeAutopilotSettings, tradeAutopilotStatus } from '@/lib/outreach/tradeAutopilot'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/trade-outreach/settings  → { settings, status }
 * PUT  /api/admin/trade-outreach/settings  body: partial settings → { settings }
 *
 * Drives the Autopilot panel: the daily trade cron reads the same settings row.
 */
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sb = getSupabaseAdmin()
  const settings = await loadTradeAutopilotSettings(sb)
  const status = await tradeAutopilotStatus(sb, settings)
  return NextResponse.json({ ok: true, settings, status })
}

export async function PUT(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const sb = getSupabaseAdmin()
  try {
    const settings = await saveTradeAutopilotSettings(sb, body)
    return NextResponse.json({ ok: true, settings })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
