import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { loadIndustryAutopilotSettings, saveIndustryAutopilotSettings, industryAutopilotStatus } from '@/lib/outreach/industryAutopilot'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/industry-outreach/settings  → { settings, status }
 * PUT  /api/admin/industry-outreach/settings  body: partial settings → { settings }
 *
 * Drives the Autopilot panel: the daily industry cron reads the same settings row.
 */
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sb = getSupabaseAdmin()
  const settings = await loadIndustryAutopilotSettings(sb)
  const status = await industryAutopilotStatus(sb, settings)
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
    const settings = await saveIndustryAutopilotSettings(sb, body)
    return NextResponse.json({ ok: true, settings })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
